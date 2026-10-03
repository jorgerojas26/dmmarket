# Linux release binaries (Ubuntu)

## Supported platform

- Ubuntu 22.04 or newer on Intel/AMD 64-bit (`uname -m` reports `x86_64`).
- The release asset is `dmmarket-app-linux`, with its checksum in `dmmarket-app-linux.sha256`.
- The binary includes the application, web interface, and runtime. Node.js and Bun are not required.
- It uses glibc and the baseline x64 target for older CPUs. Alpine/musl, ARM64, and 32-bit Linux are not supported by this asset.
- An existing DMMarket-compatible MySQL database must be reachable. Back up the database before upgrading: pending database updates run automatically at startup.

## Guided installation (recommended)

Download `DMMarket-<version>-linux.zip` from the release, extract it, and open `Instalar.sh` with **Run as a program** on Ubuntu Desktop, or run `bash Instalar.sh` in the extracted folder. It verifies the binary, requests administrator permissions, and opens a six-step browser wizard. There is no need to create `.env` or register systemd manually. Use your existing MySQL database and have a recent backup.

On a server without a desktop, keep `ssh -L 8765:127.0.0.1:8765 USER@SERVER` open from your computer and visit the full private URL printed by the installer, including the token after `#`. The wizard is loopback-only and expires in 30 minutes. See [the service installation guide](services.md).

## Manual installation as an always-on server

The manual installation registers DMMarket with systemd so it starts at boot without a login and restarts after a process failure. Download and verify the assets and prepare `.env` as described below, then run from that directory:

```sh
sudo ./dmmarket-app-linux --install-service
sudo systemctl status dmmarket.service
```

The executable and configuration are copied to `/var/lib/dmmarket/`, and the process runs as the unprivileged `dmmarket` system account. The default LAN address is `http://SERVER-IP:8000`. Allow that port only from a trusted local network. See [the service installation guide](services.md) for Ubuntu, Windows, macOS, firewall configuration, logs, and removal.

## Download and prepare

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

Protect the settings and register the service:

```sh
chmod 600 .env
sudo ./dmmarket-app-linux --install-service
```

The installed service always uses `/var/lib/dmmarket/` as its working directory. Edit the `.env` there for later configuration changes, then run `sudo systemctl restart dmmarket.service`. Reinstalling preserves that file.

The service does not open a browser. Use `http://SERVER-IP:8000` from another machine, or `http://localhost:8000` on the server. `HOST` and `PORT` can be configured in `.env` (defaults: `0.0.0.0` and `8000`). An occupied port causes startup to fail and retry, not to silently change the address.

Launching `./dmmarket-app-linux` without arguments still runs manually and attempts to open a browser using `xdg-open`. Do not run a manual instance alongside the installed service.

The HTTP server listens on all network interfaces. Restrict access with your firewall or a trusted private network; do not expose it directly to the public internet.

## Updates

Use the application's update controls to check for a new release, download and verify it, and restart. In service mode, Linux replaces the executable and restores its executable permission before exiting; systemd restarts the same path. In manual mode, `/bin/sh` replaces and relaunches the executable. Keep the application directory in place while it restarts.

If startup fails, inspect `sudo journalctl -u dmmarket.service -n 100 --no-pager` and `/var/lib/dmmarket/dmmarket-error.log`.

## Build and release

From the repository root:

```sh
bun run build:linux
```

This builds the web interface, embeds the assets and database updates, and cross-compiles `packages/backend/dmmarket-app-linux` with `--target=bun-linux-x64-baseline`.

`bun run build:installer:linux` additionally generates the guided installation ZIP in `dist/`. The existing `bun run release` flow builds Windows, macOS, and Linux binaries, generates their SHA-256 files, and uploads all six assets plus the three installer ZIPs and their hashes. The web interface is built only once. macOS uses an explicit Darwin target so running the release script on Linux cannot accidentally publish a Linux executable under the macOS filename; macOS hosts retain their native architecture, and other hosts default to macOS ARM64.
