# Docker Deployment

Run Reticulum and Ratspeak in Docker containers for clean, reproducible deployments on servers and home labs.

## Why Docker?

- **Isolation** — Reticulum runs in its own container, no system-level Python conflicts
- **Reproducibility** — same setup on any host
- **Easy updates** — pull new image, restart container
- **Multiple instances** — run several nodes on the same machine

## Running rnsd in Docker

### Basic rnsd Container

Create a `Dockerfile`:

```dockerfile
FROM python:3.12-slim

RUN pip install --no-cache-dir rns lxmf

RUN mkdir -p /root/.reticulum
COPY config /root/.reticulum/config

EXPOSE 4242

CMD ["rnsd", "--service"]
```

Create a `config` file in the same directory:

```ini
[reticulum]
  enable_transport = yes
  share_instance = yes

[logging]
  loglevel = 4

[interfaces]
  [[Default Interface]]
    type = AutoInterface
    interface_enabled = True

  [[TCP Server]]
    type = TCPServerInterface
    listen_ip = 0.0.0.0
    listen_port = 4242
    enabled = yes
```

Build and run:

```bash
docker build -t rnsd .
docker run -d --name rnsd \
  -p 4242:4242 \
  --restart unless-stopped \
  rnsd
```

### With Persistent Storage

Mount a volume to preserve identity and routing data across container restarts:

```bash
docker run -d --name rnsd \
  -p 4242:4242 \
  -v rnsd-data:/root/.reticulum \
  --restart unless-stopped \
  rnsd
```

### With USB RNode

Pass through the USB device:

```bash
docker run -d --name rnsd \
  -p 4242:4242 \
  -v rnsd-data:/root/.reticulum \
  --device=/dev/ttyUSB0:/dev/ttyUSB0 \
  --restart unless-stopped \
  rnsd
```

> **Note**: USB device paths can change. Use `/dev/serial/by-id/...` paths for reliability, and pass the parent directory if needed.

## Docker Compose

For a complete setup with both rnsd and Ratspeak:

```yaml
version: '3.8'

services:
  rnsd:
    build: .
    container_name: rnsd
    restart: unless-stopped
    ports:
      - "4242:4242"
    volumes:
      - rnsd-data:/root/.reticulum
    # Uncomment for RNode USB passthrough:
    # devices:
    #   - /dev/ttyUSB0:/dev/ttyUSB0

volumes:
  rnsd-data:
```

Start with:

```bash
docker compose up -d
```

## Network Modes

### Host Networking (AutoInterface)

AutoInterface uses IPv6 multicast, which requires host networking:

```bash
docker run -d --name rnsd \
  --network host \
  -v rnsd-data:/root/.reticulum \
  --restart unless-stopped \
  rnsd
```

With `--network host`, AutoInterface discovers local peers normally. Without it, AutoInterface only discovers other containers on the same Docker network.

### Bridge Networking (TCP Only)

The default bridge network works fine for TCP-only setups. Just expose the TCP server port:

```bash
docker run -d --name rnsd \
  -p 4242:4242 \
  -v rnsd-data:/root/.reticulum \
  --restart unless-stopped \
  rnsd
```

## Monitoring

```bash
# Check container logs
docker logs rnsd -f

# Execute commands inside the container
docker exec rnsd rnstatus
docker exec rnsd rnpath <destination_hash>
```

## Updating

```bash
docker stop rnsd
docker rm rnsd
docker build -t rnsd .    # or docker pull if using a registry
# Re-run with same volume mounts
```

The persistent volume preserves your identity and configuration across updates.

## What's Next

- [Friend Group Chat Network](../deployment/friend-group-chat) — VPS deployment guide
- [Raspberry Pi Gateway](../deployment/raspberry-pi-gateway) — dedicated hardware setup
- [Bridging Networks](../deployment/bridging-networks) — connecting separate networks
- [Configuration](../using-ratspeak/configuration) — settings reference
