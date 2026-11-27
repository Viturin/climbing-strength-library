# Climbing Strength Library

A read-only reference for climbers who want to find strength exercises and see how each movement works.

The first release will let readers search and filter exercises by equipment, read setup and form cues, and replay interactive 3D demos from different angles. The initial catalog will cover the scapular pull-up, one-arm dumbbell row, and bodyweight split squat.

The project will follow Printable Spells' architecture with an OpenAPI contract, a Spring Boot API, and a React frontend. The first deployment target is homelab staging.

## Roadmap

Follow the [issue backlog](https://github.com/Viturin/climbing-strength-library/issues) for the application, exercise catalog, 3D viewer, and staging deployment.

## Run the browser prototype

Open this checkout in IntelliJ with Node.js support enabled. Set the project Node interpreter to Node.js 24 and run **Climbing Strength Library — Web**. Open `http://localhost:5174`. The launcher installs locked dependencies on first run and when the lockfile changes.

From a terminal, run `npm --prefix web run dev:local`. To try on a phone on the same trusted network, run `npm --prefix web run dev -- --host 0.0.0.0` after installing dependencies, then open your computer's LAN address on port 5174.

### 3D asset

The mannequin is the Superhero Male from [Quaternius Universal Base Characters Standard](https://quaternius.itch.io/universal-base-characters), distributed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The base GLB was obtained from [the Avatar project's conversion](https://github.com/programasweights/avatar/blob/main/ASSETS.md). The editable animation source is `web/scripts/bake.mjs`. Run `node web/scripts/bake.mjs` after installing dependencies to regenerate the browser GLB.
