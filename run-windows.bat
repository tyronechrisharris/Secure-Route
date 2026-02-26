@echo off
set "JAVA_CMD=java"

:: Check if JAVA_HOME is set
if not "%JAVA_HOME%" == "" (
    set "JAVA_CMD=%JAVA_HOME%\bin\java"
)

:: Check if Java is available
"%JAVA_CMD%" -version >nul 2>&1
if errorlevel 1 (
    echo Error: Java is not installed or not in your PATH.
    echo Please install Java 17 or later: https://adoptium.net/
    pause
    exit /b 1
)

echo Starting Security Routing App...
"%JAVA_CMD%" -jar security-routing.jar
pause
