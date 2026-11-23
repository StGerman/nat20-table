#!/bin/bash
# The build's output, shortened where the machine has xcbeautify and whole where it has not.
if command -v xcbeautify > /dev/null; then
  exec xcbeautify --quiet
fi
exec cat
