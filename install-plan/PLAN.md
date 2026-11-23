# Easy Battle studio install plan (prepared, NOT applied)

Nothing below has been run against `/workspace/indie-studio`. Apply only after the user approves.

1. `git clone /workspace/easy-new/easybattle /workspace/indie-studio/tools/easybattle && cd $_ && git checkout --detach <SHA>`
2. `npm ci && npm run build && npm test` (expect all tests passing, Godot test skipped; `GODOT=… npx vitest run test/godot.test.ts` for the Godot check).
3. Copy `install-plan/easybattle-cli.mjs` → `/workspace/indie-studio/tools/easybattle-cli.mjs` (same shape as the other
   `easy*-cli.mjs` wrappers: sets `EASYBATTLE_HOME`, `EASYBATTLE_WORKSPACE`, adds `/workspace/indie-studio/projects` to
   `EASYBATTLE_ALLOWED_DIRS`).
4. Copy `install-plan/EASYBATTLE.md` → `/workspace/indie-studio/tools/EASYBATTLE.md` and replace `<SHA>`.
5. Smoke: `node /workspace/indie-studio/tools/easybattle-cli.mjs init --workspace /workspace/indie-studio/projects/_smoke_battle`
   then `check`, `sim --party ton:5,nurul:5,mei:5 --table plains_fields` and `export --preset godot` with the same `--workspace`.
6. Shared skill: install `SKILL.draft.md` as `easybattle-combat` (the parent agent does this).
7. Once a GitHub repo exists (user's call): `git remote add github https://github.com/Saladin2020/easybattle.git` in the install.

Ports: editor 8938, MCP HTTP 8939, Vite 5193.
