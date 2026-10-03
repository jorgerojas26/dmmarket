# Linux release binaries (Ubuntu)

## Supported platform

- Ubuntu 22.04 or newer on Intel/AMD 64-bit (`uname -m` reports `x86_64`).
- The release asset is `dmmarket-app-linux`, with its checksum in `dmmarket-app-linux.sha256`.
- The binary includes the application, web interface, and runtime. Node.js and Bun are not required.
- It uses glibc and the baseline x64 target for older CPUs. Alpine/musl, ARM64, and 32-bit Linux are not supported by this asset.
- An existing DMMarket-compatible MySQL database must be reachable. Back up the database before upgrading: pending database updates run automatically at startup.

## Install and run

Download `dmmarket-app-linux` and `dmmarket-app-linux.sha256` from the same version on the [releases page](https://github.com/jorgerojas26/dmmarket/releases). Save both in a directory owned by your user, such as `~/dmmarket`, not a system directory requiring root access.

```sh
cd ~/dmmarket
printf '%s  %s\n' "$(cat dmmarket-app-linux.sha256)" dmmarket-app-linux | sha256sum --check -
chmod +x dmmarket-app-linux
```

Continue only if checksum verification reports `OK`.

Create a `.env` file in that directory using these settings, filled with your database connection details:

```dotenv
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=dmmarket
DATABASE_PASSWORD=your-password
DATABASE_NAME=your-database
```

Protect the settings and start the application as your normal user:

```sh
chmod 600 .env
./dmmarket-app-linux
```

Always start it from this directory: configuration, update downloads, and error logs use the current working directory. Keep the directory and binary writable by your user for in-app updates.

The application opens your browser automatically when `xdg-open` is available. On Ubuntu Desktop, install `xdg-utils` if needed. On a headless machine, an unavailable browser does not stop the server; open the URL manually instead. The default is `http://localhost:8000`, with the next available port selected if it is occupied; check the terminal output for the actual port.

The HTTP server listens on all network interfaces. Restrict access with your firewall or a trusted private network; do not expose it directly to the public internet.

## Updates

Use the application's update controls to check for a new release, download and verify it, and restart. Linux selects the Linux binary and SHA-256 assets, then replaces the executable using `/bin/sh` and restores its executable permission. Keep the application directory in place while it restarts.

If startup fails, inspect `dmmarket-error.log` in the working directory.

## Build and release

From the repository root:

```sh
bun run build:linux
```

This builds the web interface, embeds the assets and database updates, and cross-compiles `packages/backend/dmmarket-app-linux` with `--target=bun-linux-x64-baseline`.

The existing `bun run release` flow builds Windows, macOS, and Linux binaries, generates their SHA-256 files, and uploads all six assets. The web interface is built only once. macOS uses an explicit Darwin target so running the release script on Linux cannot accidentally publish a Linux executable under the macOS filename; macOS hosts retain their native architecture, and other hosts default to macOS ARM64.
