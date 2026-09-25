@echo off
chcp 65001 >nul
title PharmaStock - demarrage
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo   PharmaStock - installation et demarrage (Windows 11)
echo   Ce fichier fait tout a votre place : configuration,
echo   base de donnees, dependances, puis demarrage.
echo ============================================================
echo.

REM ---------------------------------------------------------------
REM  1. Node.js
REM ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe sur ce PC.
  echo.
  echo   1. Ouvrez https://nodejs.org
  echo   2. Telechargez Node.js 20 LTS ^(.msi^) et installez-le.
  echo   3. Relancez ensuite ce fichier.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VERSION=%%v
for /f "delims=" %%v in ('npm -v') do set NPM_VERSION=%%v
echo [OK] Node.js %NODE_VERSION% - npm %NPM_VERSION%
echo.

where psql >nul 2>nul
if errorlevel 1 (
  echo [INFO] La commande psql n'est pas dans le PATH : ce n'est pas bloquant,
  echo        mais elle sera utile pour creer la base de donnees ^(voir docs\1^).
  echo.
)

REM ---------------------------------------------------------------
REM  2. Fichier de configuration backend\.env
REM ---------------------------------------------------------------
if not exist "backend\.env" (
  echo [1/5] Creation du fichier de configuration backend\.env ...
  copy /y "backend\.env.example" "backend\.env" >nul
  echo       Le Bloc-notes va s'ouvrir : renseignez au minimum
  echo         DATABASE_URL   ^(postgres://pharmastock:MOTDEPASSE@127.0.0.1:5432/pharmastock^)
  echo         ADMIN_PASSWORD ^(12 caracteres minimum^)
  echo       puis ENREGISTREZ ^(Ctrl+S^) et fermez le Bloc-notes.
  echo.
  echo       Remarque : SESSION_SECRET n'existe pas dans ce projet ^(inutile de
  echo       l'ajouter^) et le nom de la pharmacie se regle dans l'application,
  echo       ecran Parametres. Detail : docs\7-REMPLIR-BACKEND-ENV.md
  echo.
  notepad "backend\.env"
  echo       Configuration enregistree, on continue.
) else (
  echo [1/5] Configuration backend\.env : deja presente, conservee.
)
findstr /b /c:"DATABASE_URL=postgres://" "backend\.env" >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ATTENTION] La ligne DATABASE_URL de backend\.env ne ressemble pas a
  echo             une adresse PostgreSQL. Ouvrez le fichier et corrigez-la :
  echo             DATABASE_URL=postgres://pharmastock:MOTDEPASSE@127.0.0.1:5432/pharmastock
  echo.
  pause
)
echo.

REM ---------------------------------------------------------------
REM  3. Dependances
REM ---------------------------------------------------------------
if not exist "node_modules" (
  echo [2/5] Installation des dependances ^(1 a 3 minutes^) ...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERREUR] npm install a echoue. Verifiez la connexion Internet,
    echo          puis relancez ce fichier.
    pause
    exit /b 1
  )
) else (
  echo [2/5] Dependances : deja installees.
)
echo.

REM ---------------------------------------------------------------
REM  4. Base de donnees : schema + administrateur
REM ---------------------------------------------------------------
echo [3/5] Creation du schema de la base ^(27 tables, vues, declencheurs^) ...
call npm run db:migrate
if errorlevel 1 (
  echo.
  echo [ERREUR] La migration a echoue. Verifiez que :
  echo          - le service PostgreSQL est demarre ^(Services Windows^) ;
  echo          - DATABASE_URL de backend\.env est correct ^(mot de passe encode si @ : / ?^) ;
  echo          - la base "pharmastock" et l'utilisateur existent ^(docs\1, etape 3^).
  pause
  exit /b 1
)
echo.
echo [4/5] Creation du compte administrateur ...
call npm run admin:create
if errorlevel 1 (
  echo       ^(Ce message est normal si un compte existe deja : aucun doublon n'est cree.^)
) else (
  echo       Notez ce mot de passe : il servira a ouvrir l'application.
  echo       Vous pouvez maintenant effacer la ligne ADMIN_PASSWORD de backend\.env.
)

echo.
set /p REPONSE="Ajouter les donnees de demonstration (6 medicaments + 3 comptes d'essai) ? (O/N) : "
if /i "%REPONSE%"=="O" (
  call npm run demo:seed
  if errorlevel 1 echo       ^(Donnees deja presentes : rien n'a ete ajoute.^)
  call npm run demo:users
  if errorlevel 1 echo       ^(Comptes d'essai deja presents : rien n'a ete ajoute.^)
)
echo.

REM ---------------------------------------------------------------
REM  5. Demarrage
REM ---------------------------------------------------------------
echo [5/5] Demarrage de l'API et de l'interface ...
echo.
echo   ----------------------------------------------------------
echo     Adresse a ouvrir : http://localhost:5173
echo     API              : http://127.0.0.1:3001/api/health
echo     Identifiant      : celui de backend\.env ^(ADMIN_LOGIN, defaut : admin^)
echo.
echo     Pour ARRETER : appuyez sur Ctrl+C dans cette fenetre.
echo     Pour RELANCER plus tard : double-cliquez simplement sur ce fichier.
echo   ----------------------------------------------------------
echo.
echo   Le navigateur va s'ouvrir dans quelques secondes ...
start "" /min cmd /c "ping -n 12 127.0.0.1 >nul & start http://localhost:5173"
echo.
call npm run dev

echo.
echo L'application est arretee.
pause
