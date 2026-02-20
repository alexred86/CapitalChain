@echo off
echo ========================================
echo   COMPILANDO APK - VERSAO 7
echo ========================================
echo.
echo Sistema Completo de Impostos para IR
echo Calculo Automatico de DARF
echo Gestao de Patrimonio em Criptoativos
echo Exportacao WhatsApp/Email/Clipboard
echo.
echo Compilacao pode levar 10-20 minutos...
echo Gradle ira baixar ~2-3 GB de dependencias
echo Por favor, aguarde sem interromper...
echo.
echo Iniciando em 3 segundos...
timeout /t 3 /nobreak >nul

set JAVA_HOME=D:\1 - SOFTWARES\Temp\jdk-17\jdk-17.0.18+8
set ANDROID_HOME=D:\1 - SOFTWARES\Temp\android-sdk
set PATH=D:\1 - SOFTWARES\Temp\nodejs\node-v24.13.1-win-x64\node-v24.13.1-win-x64;%JAVA_HOME%\bin;%ANDROID_HOME%\cmdline-tools\latest\bin;%ANDROID_HOME%\platform-tools;%PATH%

cd /d "D:\1 - SOFTWARES\Temp\Apk\android"

echo.
echo Executando Gradle...
echo.

C:\gradle\gradle-8.3\bin\gradle.bat assembleRelease --no-daemon

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   APK COMPILADO COM SUCESSO!
    echo ========================================
    echo.
    echo Localizacao: android\app\build\outputs\apk\release\app-release.apk
    echo.
) else (
    echo.
    echo ========================================
    echo   ERRO NA COMPILACAO!
    echo ========================================
    echo.
    echo Codigo de erro: %ERRORLEVEL%
    echo.
)

pause
