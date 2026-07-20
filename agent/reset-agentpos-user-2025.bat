@echo off
setlocal EnableDelayedExpansion
title Creation utilisateur agentPos - MySQL Clyo 2025
color 0B

REM ============================================================
REM   A ADAPTER si besoin : le Clyo 2015 et le Clyo 2025 partagent la
REM   meme installation MySQL (C:\Clyo\mysql, service Windows "MySQL"),
REM   juste basculee/swappee selon la version active sur ce poste.
REM ============================================================
set "MYSQL_BIN=C:\Clyo\mysql\bin"
set "MYSQL_DATADIR=C:\Clyo\mysql\data"
set "MYSQL_SERVICE=MySQL"
set "MYSQL_PORT=3306"
REM Service(s) qui dependent de MySQL (arretes automatiquement avec lui,
REM Windows ne les redemarre pas tout seul ensuite -> on le fait nous-memes).
set "DEPENDENT_SERVICE=ClyoBackgroundService"

REM Sous --skip-grant-tables, MySQL refuse CREATE USER/GRANT (erreur 1290) :
REM ce sont des commandes de gestion de comptes explicitement bloquees, meme
REM sans verification des privileges. Le contournement officiel (doc MySQL,
REM procedure historique de reset du mot de passe root) est d'inserer
REM directement dans mysql.user. Cette instance (5.0.22) n'a pas la table
REM mysql.user au nouveau format de mot de passe (vu dans les logs), donc
REM OLD_PASSWORD() est necessaire (PASSWORD() produirait un hash trop long
REM pour la colonne et l'authentification echouerait ensuite).
REM
REM La liste exacte des colonnes de mysql.user varie selon l'historique de
REM cette installation (jamais passee par mysql_upgrade) : certaines
REM colonnes de privileges recentes (ex: Create_view_priv) peuvent ne pas
REM exister. Plutot que deviner, le script detecte les colonnes reellement
REM presentes (etape 3, ci-dessous) avant de construire l'INSERT.
set "COLS_FILE=%TEMP%\agentpos_user_cols.txt"

echo ===============================================
echo   CREATION DE agentPos SUR MySQL CLYO 2025
echo ===============================================
echo.
echo A utiliser uniquement si le mot de passe root de cette instance
echo est inconnu / verrouille. Ce script va :
echo   1. Arreter le service MySQL "%MYSQL_SERVICE%" (et "%DEPENDENT_SERVICE%" qui en depend)
echo   2. Redemarrer mysqld temporairement avec --skip-grant-tables
echo      (authentification desactivee, TEMPORAIREMENT, en local uniquement)
echo   3. Creer l'utilisateur agentPos
echo   4. Arreter mysqld temporaire et relancer les services normaux
echo.
echo Verifie d'abord que MYSQL_BIN / MYSQL_DATADIR / MYSQL_SERVICE /
echo MYSQL_PORT ci-dessus correspondent a l'installation reelle sur ce poste.
echo.

net session >nul 2>&1
if not !errorlevel! equ 0 (
    echo [ERREUR] Ce script doit etre lance en Administrateur.
    echo Clic droit -^> "Executer en tant qu'administrateur".
    pause
    exit /b 1
)

REM Selon la version de MySQL installee, le binaire du serveur s'appelle
REM mysqld.exe ou (anciennes versions, ex: MySQL 4.x/5.0) mysqld-nt.exe.
set "MYSQLD_EXE=mysqld.exe"
if not exist "%MYSQL_BIN%\mysqld.exe" set "MYSQLD_EXE=mysqld-nt.exe"

if not exist "%MYSQL_BIN%\%MYSQLD_EXE%" (
    echo [ERREUR] mysqld.exe / mysqld-nt.exe introuvable dans "%MYSQL_BIN%".
    echo Corrige la variable MYSQL_BIN en haut de ce script.
    pause
    exit /b 1
)

set /p confirm="Continuer ? (o/N) : "
if /i not "!confirm!"=="o" (
    echo Annule.
    exit /b 0
)

echo.
echo [1/4] Arret du service %MYSQL_SERVICE% (et de ses services dependants)...
net stop "%MYSQL_SERVICE%" /y >nul 2>&1

REM "net stop" peut rendre la main avant que le process ait vraiment libere
REM ses fichiers (ibdata1) -> on attend sa disparition reelle, sinon le
REM mysqld manuel demarre en dessous plante avec une erreur de partage.
set "WAIT_COUNT=0"
:wait_stopped
tasklist /FI "IMAGENAME eq %MYSQLD_EXE%" 2>nul | find /I "%MYSQLD_EXE%" >nul
if not errorlevel 1 (
    set /a WAIT_COUNT+=1
    if !WAIT_COUNT! GEQ 20 goto after_wait_stopped
    timeout /t 1 /nobreak >nul
    goto wait_stopped
)
:after_wait_stopped

echo [2/4] Demarrage temporaire de mysqld en mode --skip-grant-tables...
start "mysqld-skip-grant-tables" /min "%MYSQL_BIN%\%MYSQLD_EXE%" --datadir="%MYSQL_DATADIR%" --port=%MYSQL_PORT% --skip-grant-tables

REM Attend que mysqld accepte vraiment les connexions avant d'executer le SQL
REM (au lieu d'un delai fixe qui peut etre trop court ou trop long).
set "WAIT_COUNT=0"
:wait_ready
"%MYSQL_BIN%\mysql.exe" -u root -h 127.0.0.1 -P %MYSQL_PORT% --connect_timeout=2 -e "SELECT 1" >nul 2>&1
if errorlevel 1 (
    set /a WAIT_COUNT+=1
    if !WAIT_COUNT! GEQ 20 (
        echo [ERREUR] mysqld ne repond pas apres 20s en mode --skip-grant-tables.
        goto cleanup
    )
    timeout /t 1 /nobreak >nul
    goto wait_ready
)

echo [3/4] Detection des colonnes de mysql.user sur cette installation...
"%MYSQL_BIN%\mysql.exe" -u root -h 127.0.0.1 -P %MYSQL_PORT% -N -B -e "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='mysql' AND TABLE_NAME='user'" > "%COLS_FILE%" 2>nul

REM Mot de passe vide expres : les tres vieux serveurs comme celui-ci
REM stockent les mots de passe au format pre-4.1 (colonne Password trop
REM etroite), que les clients modernes (HeidiSQL, etc.) refusent
REM d'authentifier. Un mot de passe vide ne declenche aucune negociation
REM de format de hash, donc ca marche avec n'importe quel client.
set "INSERT_COLS=Host,User,Password"
set "INSERT_VALS='localhost','agentPos',''"

for %%P in (Select_priv Insert_priv Update_priv Delete_priv Create_priv Drop_priv Reload_priv Shutdown_priv Process_priv File_priv Grant_priv References_priv Index_priv Alter_priv Show_db_priv Super_priv Create_tmp_table_priv Lock_tables_priv Execute_priv Repl_slave_priv Repl_client_priv Create_view_priv Show_view_priv Create_routine_priv Alter_routine_priv Create_user_priv Event_priv Trigger_priv Create_tablespace_priv) do (
    findstr /I /X /C:"%%P" "%COLS_FILE%" >nul
    if not errorlevel 1 (
        set "INSERT_COLS=!INSERT_COLS!,%%P"
        set "INSERT_VALS=!INSERT_VALS!,'Y'"
    )
)

for %%P in (ssl_type ssl_cipher x509_issuer x509_subject) do (
    findstr /I /X /C:"%%P" "%COLS_FILE%" >nul
    if not errorlevel 1 (
        set "INSERT_COLS=!INSERT_COLS!,%%P"
        set "INSERT_VALS=!INSERT_VALS!,''"
    )
)

for %%P in (max_questions max_updates max_connections max_user_connections) do (
    findstr /I /X /C:"%%P" "%COLS_FILE%" >nul
    if not errorlevel 1 (
        set "INSERT_COLS=!INSERT_COLS!,%%P"
        set "INSERT_VALS=!INSERT_VALS!,0"
    )
)

set "CREATE_USER_SQL=INSERT INTO mysql.user (!INSERT_COLS!) VALUES (!INSERT_VALS!); FLUSH PRIVILEGES;"

echo [3/4] Execution du SQL (creation de agentPos)...
"%MYSQL_BIN%\mysql.exe" -u root -h 127.0.0.1 -P %MYSQL_PORT% -e "!CREATE_USER_SQL!"
if not !errorlevel! equ 0 (
    echo [ERREUR] L'execution du SQL a echoue ^(voir message ci-dessus^).
) else (
    echo OK.
)
del "%COLS_FILE%" >nul 2>&1

:cleanup
echo [4/4] Arret de mysqld temporaire et redemarrage des services normaux...
taskkill /F /IM %MYSQLD_EXE% >nul 2>&1
timeout /t 3 /nobreak >nul
net start "%MYSQL_SERVICE%" >nul 2>&1
net start "%DEPENDENT_SERVICE%" >nul 2>&1

echo.
echo Verification finale (connexion authentifiee en tant que agentPos)...
set "WAIT_COUNT=0"
:wait_final
"%MYSQL_BIN%\mysql.exe" -u agentPos -h 127.0.0.1 -P %MYSQL_PORT% --connect_timeout=2 -e "SELECT 1" >nul 2>&1
if not errorlevel 1 goto final_ok
set /a WAIT_COUNT+=1
if !WAIT_COUNT! GEQ 15 goto final_fail
timeout /t 1 /nobreak >nul
goto wait_final

:final_ok
echo [OK] Connexion agentPos reussie. L'utilisateur est operationnel.
goto end

:final_fail
echo [ERREUR] Impossible de se connecter avec agentPos apres redemarrage.
echo Verifie manuellement :
echo   "%MYSQL_BIN%\mysql.exe" -u agentPos -h 127.0.0.1 -P %MYSQL_PORT%

:end
echo.
pause
