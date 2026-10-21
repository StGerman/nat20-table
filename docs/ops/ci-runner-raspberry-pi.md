# Self-hosted CI runner on a Raspberry Pi 4

How to set up, trial, run and switch off the self-hosted arm64 runner that takes most of nat20-table's CI ([decision 0028](../decisions/0028-self-hosted-arm64-runner.md)). The workflows route jobs to it only while the repository variable `CI_RUNNER` is set; with the variable unset, everything runs on GitHub-hosted runners as before.

## What runs where

| Run | Runner |
|---|---|
| PRs and pushes to `main`, every job but `deny` and `advisories` | the Pi |
| PRs that change `Cargo.lock` or `rust-toolchain.toml` (a cold build) | GitHub-hosted |
| Dependabot PRs | GitHub-hosted, so a new crate's `build.rs` or proc macro never runs at home before review |
| `deny`, `advisories` (Docker-based action) | always GitHub-hosted |
| weekly `core-drift` | the Pi (nobody waits on it) |

The choice is made in the `changes` job of `.github/workflows/ci.yml`; its log says which runner it picked and why.

## Expected speed on a Pi 4 (8 GB)

Estimates until the trial run measures them; record the real numbers in the decision record.

| Build | GitHub-hosted (2 vCPU) | Pi 4 |
|---|---|---|
| Warm: only our crates changed, `target/` kept | 2-3 min for rust-test | 3-6 min |
| Cold: new lockfile, core pin or toolchain | about 9 min | 30-45 min, sometimes more while throttled |

A cold build fits in 8 GB; the risk is time, not memory. That is why PRs that change `Cargo.lock` stay on hosted runners, and only the push to `main` after the merge (which nobody waits on) builds them cold on the Pi, warming `target/` for the next PR. The Pi runs one job at a time, so a ten-PR stack rebase queues; rebase one PR per merge (TASKS.md CON-10).

## Hardware

- Raspberry Pi 4, 8 GB.
- A USB 3 SSD (128 GB or more) on a blue USB 3 port, ideally also the boot disk. Never build on the SD card: it is several times slower and wears out.
- Active cooling (fan case or heatsink with fan). Above about 80 °C the Pi 4 throttles, and a cold build runs every core for half an hour. Check with `vcgencmd measure_temp` and `vcgencmd get_throttled` (`0x0` = never throttled).
- Wired Ethernet and the official 3 A power supply (undervoltage also throttles).

## Setup

1. **OS:** Raspberry Pi OS Lite 64-bit (Bookworm) or Ubuntu Server 24.04 arm64. `uname -m` must print `aarch64`.
2. **Network:** put the Pi on its own VLAN or guest network, or block traffic from it to the rest of the LAN (for example nftables dropping 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16 except the gateway and DNS). The runner needs outbound HTTPS only (github.com, `*.actions.githubusercontent.com`, crates.io, static.rust-lang.org, registry.npmjs.org, nodejs.org) and no inbound port.
3. **Packages:** `sudo apt update && sudo apt install -y build-essential pkg-config git jq curl ca-certificates zram-tools`. `build-essential` is for mlua's vendored Lua; `jq` is used by the rust-test job.
4. **Swap:** in `/etc/default/zramswap` set `PERCENT=50`, then `sudo systemctl restart zramswap`. It absorbs link-time peaks.
5. **User and disk:** `sudo adduser --disabled-password --gecos "" runner` (no sudo, not in the `docker` group). Mount the SSD at `/srv/nat20-ci` and `sudo chown runner: /srv/nat20-ci`.
6. **Rust:** as `runner`: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none`. Each job runs `rustup toolchain install`, which installs the release pinned in `rust-toolchain.toml`.
7. **Runner:** GitHub > nat20-table > Settings > Actions > Runners > New self-hosted runner > Linux, ARM64. As `runner`, in `~/actions-runner`, follow the download steps shown there, then:
   ```bash
   ./config.sh --url https://github.com/StGerman/nat20-table --token <token from that page> \
     --name pi4 --labels nat20 --work /srv/nat20-ci/work --unattended
   cat >> .env <<'ENV'
   CARGO_TARGET_DIR=/srv/nat20-ci/target
   CARGO_BUILD_JOBS=3
   PATH=/home/runner/.cargo/bin:/usr/local/bin:/usr/bin:/bin
   ENV
   sudo ./svc.sh install runner && sudo ./svc.sh start
   ```
   `CARGO_TARGET_DIR` outside the checkout survives `actions/checkout`'s clean, so builds stay warm across runs and branches. `CARGO_BUILD_JOBS=3` leaves one core for the runner and the OS and keeps heat down.
8. **Disk cleanup:** as `runner`, `crontab -e`:
   ```
   # Sundays 04:00: wipe the build cache once the SSD is 70% full; Monday's core-drift rebuilds it.
   0 4 * * 0 [ "$(df --output=pcent /srv/nat20-ci | tail -1 | tr -dc 0-9)" -ge 70 ] && rm -rf /srv/nat20-ci/target
   ```
9. **Updates:** leave runner auto-update on (a runner more than 30 days behind stops getting jobs). Enable `unattended-upgrades` for the OS.

## Trial, then switch on

1. Settings > Secrets and variables > Actions > Variables > New repository variable: `CI_RUNNER` = `["self-hosted","linux","ARM64","nat20"]`.
2. Actions > ci > Run workflow on `main`. This is a cold build on the Pi; note the rust-test time.
3. Green: done, CI now runs on the Pi. Record the cold and the first warm timing in decision 0028.
4. Red in the conformance fixtures: the seeded fixtures were recorded on x86-64 and replay differently on arm64 (TASKS.md CON-13). Delete `CI_RUNNER` at once and fix the cause before trying again; never keep per-architecture fixtures.

## Switch off or fall back

Delete the `CI_RUNNER` variable (or set it to `"ubuntu-latest"`). New runs go to GitHub-hosted runners. Runs already queued for the Pi stay queued: cancel them and use "Re-run all jobs". Do this whenever the Pi is down for more than a few minutes, or the stack stops moving.

## What this exposes

- Every job runs code from any branch pushed to this repo: Stas's and the Claude sessions'. The runner user has no sudo, no Docker and no secrets; the workflows use no repository secrets.
- Dependabot PRs build on hosted runners, but once one merges, the push to `main` builds the new dependencies on the Pi. That is the same code that then runs on Stas's Mac; the network isolation above limits what a bad crate could reach.
- The runner registration token is single-use. The runner's own credentials live in `~/actions-runner/.credentials*`; if the Pi is lost, remove the runner under Settings > Actions > Runners.
