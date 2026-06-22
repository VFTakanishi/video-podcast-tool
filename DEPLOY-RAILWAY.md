# Railway deployment steps

## 1. Put this project on GitHub

Upload the `video-podcast-tool` folder to a GitHub repository.

## 2. Create a Railway project

In Railway:

1. Create a new project
2. Choose `Deploy from GitHub repo`
3. Select this repository

Railway can build it from the included `Dockerfile`.

## 3. Add a persistent volume

Create one volume and mount it here:

```text
/app/data
```

This keeps:

- saved default assets
- uploaded working files
- finished build jobs

## 4. Check the environment

Recommended values:

```text
PORT=3210
HOST=0.0.0.0
DATA_ROOT=/app/data
PODCAST_FFMPEG_PATH=/usr/bin/ffmpeg
```

## 5. Generate a public URL

In Railway service settings:

1. Open `Networking`
2. Open `Public Networking`
3. Click `Generate Domain`

Railway will issue a public `.railway.app` URL.

## 6. First launch check

Open the public URL and confirm:

- the page opens
- default assets are shown
- one short video can be generated

## 7. Optional custom domain

If you want your own domain later, add it from Railway domain settings and follow the DNS records Railway shows.
