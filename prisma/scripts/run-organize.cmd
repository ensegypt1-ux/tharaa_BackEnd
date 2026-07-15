@echo off
cd /d "%~dp0..\.."
set DATABASE_URL=postgresql://tharaa:tharaa@localhost:55432/tharaa_market?schema=public
npx ts-node --transpile-only prisma/scripts/organize-subcategories.ts %*
