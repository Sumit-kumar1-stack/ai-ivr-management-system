@echo off
setlocal

cd /d "%~dp0"
set NODE_ENV=production

echo.
echo ========================================
echo R2 Production Environment Validation
echo ========================================
echo.

npx tsx scripts\validate-production-env.ts
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo R2 FAILED. Fix every [FAIL] item above.
  exit /b %EXIT_CODE%
)

echo.
echo R2 environment validation passed.
exit /b 0