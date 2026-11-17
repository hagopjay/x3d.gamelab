# Apply and publish the prepared change

The patch is based on main at
`e93e3db3d9b67dfaee1c626ee21efe86fd23d8d7`.
It is a plain `git diff --binary` patch, applied with `git apply`.

From a clean checkout at that base, with `CHASM-GameLab.patch` available:

```sh
git switch -c feat/cavern-descent
git apply --check /path/to/CHASM-GameLab.patch
git apply /path/to/CHASM-GameLab.patch
npm ci --ignore-scripts
npm test
python3 cavern/serve.py --open
```

After reviewing the game, source and reports:

```sh
git add README.md package.json cavern
git commit -m "Add CHASM wingsuit cavern observatory"
git push -u origin feat/cavern-descent
gh pr create --base main --head feat/cavern-descent --title "Add CHASM: a 3D wingsuit ragdoll cavern observatory" --body-file cavern/docs/PR.md
```

If main has advanced, use an isolated branch/worktree and review any conflict.
The supplied patch has been checked against its exact base. The supplied PR
text is a draft; no remote branch or PR was created by this delivery.
