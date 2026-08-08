# Agent Instructions — Sky House Cleaning Website

Coding-specific instructions for Claude (and other agents) working in this Astro project. These override default agent behavior.

## Never run npm commands

Do not run `npm install`, `npm run dev`, `npm run build`, `npm run preview`, or any other npm/node command in this project — for any reason, including "verifying" or "testing" changes.

- Builds are handled by Vercel on deploy. There's no need to run `npm run build` to check for errors.
- The dev server (`npm run dev`) is already running locally on my machine. You don't need to start it.
- If you want to sanity-check a change, do it by reading the files (syntax, structure, matching patterns already used elsewhere in the codebase) — not by running a command.

## Never run git commands

Do not run `git add`, `git commit`, `git push`, `git status`, or any other git command in this project. I handle git myself.

## Summary

Just edit the files. Don't install, build, run, or push anything.
