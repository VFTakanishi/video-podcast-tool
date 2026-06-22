# Video Podcast Tool

One recorded video in, one finished MP4 out.

This app creates:

- an intro clip from a still image and BGM
- a main clip with low-volume looping BGM
- optional jingle clips inserted at chosen timestamps
- one final MP4 ready for upload

## Local use

Start the browser UI:

```bash
npm run start:web
```

Then open:

```text
http://127.0.0.1:3210
```

## Public URL deployment

This project is prepared for container deployment.

Included:

- `Dockerfile`
- `.dockerignore`
- web server that listens on `PORT`
- Linux `ffmpeg` path support
- persistent data root via `DATA_ROOT`

## Recommended deployment target

For this app, a container host is a better fit than a static host because it needs:

- long-running video processing
- uploaded files
- ffmpeg
- writable storage

## Railway deployment outline

1. Push this folder to GitHub.
2. Create a new Railway project from that GitHub repo.
3. Let Railway deploy from the included `Dockerfile`.
4. Add a volume and mount it to:

```text
/app/data
```

5. Generate a public domain in Railway.
6. Open the generated URL and test one short video first.

## Important runtime paths

- app data: `/app/data`
- default assets: `/app/data/default-assets`
- generated jobs: `/app/data/build-web`

## Notes

- If you do not choose files in the form, saved default assets are used.
- If you enable `no jingles`, the episode is built without jingle inserts.
- Large uploads and long videos need a host with enough CPU, disk, and request limits.
