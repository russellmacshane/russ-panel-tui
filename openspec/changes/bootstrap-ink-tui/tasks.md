## 1. Project scaffolding

- [ ] 1.1 Create `package.json` with `"type": "module"`, `"private": true`, and `build` (`tsc`) + `start` (`node dist/cli.js`) scripts
- [ ] 1.2 Add dependencies `ink@7` and `react@19`; dev dependencies `typescript` and `@types/react`
- [ ] 1.3 Run `npm install` and confirm peer dependencies resolve without errors
- [ ] 1.4 Create `tsconfig.json` (`jsx: "react-jsx"`, `module: "nodenext"`, `moduleResolution: "nodenext"`, `outDir: "dist"`, `rootDir: "src"`, `strict: true`)

## 2. Application source

- [ ] 2.1 Create `src/app.tsx` exporting a root `<App>` component that renders `<Text color="green">Hello, world</Text>`
- [ ] 2.2 Create `src/cli.tsx` entry point that imports `render` from `ink` and mounts `<App />`

## 3. Build and verify

- [ ] 3.1 Run `npm run build` and confirm `tsc` compiles with no type errors and produces `dist/cli.js`
- [ ] 3.2 Run `npm start` and confirm the terminal shows "Hello, world" in green and the process exits cleanly (code 0)
- [ ] 3.3 Update `README.md` with a short "Run it" section (`npm install`, `npm run build`, `npm start`)
