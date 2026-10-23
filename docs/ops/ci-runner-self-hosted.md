# Self-hosted arm64 CI runner

How to set up, trial, run and switch off the self-hosted arm64 Linux runner that takes most of nat20-table's CI ([decision 0028](../decisions/0028-self-hosted-arm64-runner.md)). The main host is a Linux VM on Stas's Apple Silicon Mac; a Raspberry Pi is the alternative at the end. The workflows route jobs to the runner only while the repository variable `CI_RUNNER` is set; with it unset, everything runs on GitHub-hosted runners.

## What runs where

| Run | Runner |
|---|---|
| PRs, pushes to `main`, manual runs: every job but `deny` and `advisories` | self-hosted |
| Dependabot PRs | GitHub-hosted, so a new crate's `build.rs` or proc macro never runs on Stas's machine before review |
| PRs that change `Cargo.lock` or `rust-toolchain.toml` | self-hosted; GitHub-hosted only when `CI_COLD_HOSTED` is `true` (set it for a slow box like a Pi) |
| `deny`, `advisories` (Docker-based action) | always GitHub-hosted |
| weekly `core-drift` | self-hosted |

The `changes` job in `.github/workflows/ci.yml` makes the choice; its log says which runner and why.

## Why a Linux VM and not the Mac itself

- **Isolation.** A runner on macOS runs every pushed branch's code as a macOS user. In Stas's own account that code can read his home directory, SSH keys, keychain prompts and browser data. A VM with no shared folders sees none of it.
- **Same platform as CI and production.** The workflows are written for Linux (bash with GNU `grep -P` and `sed -i` in `weekly.yml`, systemd service), and production will likely be Linux on arm64 (Graviton). macOS has its own libm, so seeded fixtures could drift on macOS where Linux arm64 does not.
- **Speed.** An M-series core is roughly twice a hosted runner's vCPU. Expect a cold build of about 4-6 min with 6 cores (hosted: about 9) and warm runs of 1-2 min; record the real numbers after the trial.

## The catch: the Mac has to be awake

GitHub sends jobs only to an online runner. While the Mac sleeps or is off, jobs for it wait in the queue (up to 24 hours, then they fail) and the stack stops moving. So either:
- keep it awake while CI matters: System Settings > Battery (or Energy) > "Prevent automatic sleeping when the display is off" on power adapter, lid open or an external display; or
- delete the `CI_RUNNER` variable before closing the laptop for the night, and set it again in the morning (both take a few seconds under Settings > Secrets and variables > Actions > Variables).

## Setup on the Mac (Lima VM)

[Lima](https://lima-vm.io) is Apache-2.0 and uses Apple's Virtualization.framework, so the VM runs arm64 at native speed.

1. `brew install lima`
2. Create the VM without any shared folders (Lima mounts your home directory by default; `--mount-none` turns that off):
   ```bash
   limactl start --name=nat20-ci --vm-type=vz --cpus=6 --memory=12 --disk=80 --mount-none template:ubuntu-24.04
   limactl shell nat20-ci
   ```
   6 of the Mac's cores and 12 GB leave the desktop usable during a build; lower them on a 16 GB machine (4 CPUs, 8 GB).
3. Inside the VM: `uname -m` must print `aarch64`. Then:
   ```bash
   sudo apt update && sudo apt install -y build-essential pkg-config git jq curl ca-certificates
   sudo adduser --disabled-password --gecos "" runner      # no sudo, no docker group
   sudo mkdir -p /srv/nat20-ci && sudo chown runner: /srv/nat20-ci
   sudo -iu runner
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none
   ```
   `build-essential` is for mlua's vendored Lua; `jq` is used by the rust-test job. Each job runs `rustup toolchain install`, which installs the release pinned in `rust-toolchain.toml`.
4. Register the runner: GitHub > nat20-table > Settings > Actions > Runners > New self-hosted runner > **Linux**, **ARM64**. As `runner`, in `~/actions-runner`, follow the download steps shown there, then:
   ```bash
   ./config.sh --url https://github.com/StGerman/nat20-table --token <token from that page> \
     --name mac-vm --labels nat20 --work /srv/nat20-ci/work --unattended
   cat >> .env <<'ENV'
   CARGO_TARGET_DIR=/srv/nat20-ci/target
   PATH=/home/runner/.cargo/bin:/usr/local/bin:/usr/bin:/bin
   ENV
   exit                                                     # back to the default VM user
   cd /home/runner/actions-runner && sudo ./svc.sh install runner && sudo ./svc.sh start
   ```
   `CARGO_TARGET_DIR` outside the checkout survives `actions/checkout`'s clean, so builds stay warm across runs and branches.
5. Start the VM with the Mac: `limactl start nat20-ci` after a reboot (or a login item running it). The runner service starts with the VM.
6. Disk cleanup, as `runner` (`crontab -e`):
   ```
   # Sundays 04:00: wipe the build cache once the disk is 70% full, but only while no job is running
   # (Runner.Worker exists only during a job); the next run rebuilds it.
   0 4 * * 0 pgrep -f Runner.Worker >/dev/null || { [ "$(df --output=pcent /srv/nat20-ci | tail -1 | tr -dc 0-9)" -ge 70 ] && rm -rf /srv/nat20-ci/target; }
   ```
7. Updates: leave runner auto-update on (a runner more than 30 days behind stops getting jobs); `sudo apt upgrade` in the VM now and then.

## Trial, then switch on

1. Settings > Secrets and variables > Actions > Variables > New repository variable: `CI_RUNNER` = `["self-hosted","linux","ARM64","nat20"]` (JSON, exactly like this; a bare word fails the workflow).
2. Actions > ci > Run workflow on `main`. This is a cold build on the VM; note the rust-test time.
3. Green: done. Record the cold and the first warm timing in decision 0028.
4. Red in the conformance fixtures: the seeded fixtures were recorded on x86-64 and replay differently on arm64 (TASKS.md CON-13). Delete `CI_RUNNER` at once and fix the cause before trying again; never keep per-architecture fixtures.

## Switch off or fall back

Delete the `CI_RUNNER` variable. New runs go to GitHub-hosted runners. Runs already queued for the self-hosted runner stay queued: cancel them and use "Re-run all jobs".

## What this exposes

- Every job runs code from any branch pushed to this repo: Stas's and the Claude sessions'. Inside the VM the runner user has no sudo, no Docker, no shared folders and no secrets; the workflows use no repository secrets.
- The VM reaches the network through the Mac, so a hostile build script could reach the home LAN. Dependabot PRs build on hosted runners, but once one merges, the push to `main` builds the new dependencies on the VM. That is the same code that then runs on the Mac itself via `cargo build`, so the VM adds no new exposure beyond what local development already has.
- The registration token is single-use. If the VM is deleted, remove the runner under Settings > Actions > Runners.

## Alternative host: Raspberry Pi 4 or 5 (8 GB)

The same steps work on Raspberry Pi OS Lite 64-bit or Ubuntu Server 24.04 arm64, without Lima, with these differences:
- A USB 3 SSD (Pi 4) or NVMe (Pi 5) for `/srv/nat20-ci`, never the SD card; active cooling (it throttles above about 80 °C); zram swap (`zram-tools`, `PERCENT=50`); `CARGO_BUILD_JOBS=3` in `.env`.
- A Pi 4 builds cold in an estimated 30-45 min, so set the repo variable `CI_COLD_HOSTED` to `true`: lockfile and toolchain PRs then stay on hosted runners and only the push to `main` builds cold on the Pi.
- Put it on its own VLAN or block its traffic to the rest of the LAN.
