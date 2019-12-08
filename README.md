# nix-sec-tracker

A tracker that keeps track of security releated PRs being merged in nixos

# How does it work

- Every hour it pulls all pull requests. It processes those that are closed, extracts metadata such as a CVE and generates a list in JSON format, as well as a file with the last PR id that got merged.

- TODO: Find a way to check when the PR lands in a channel, possibly by tracking the merged commit.
