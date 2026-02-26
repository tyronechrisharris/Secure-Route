#!/bin/bash

# Check if Java is installed
if ! command -v java &> /dev/null; then
    echo "Error: Java is not installed or not in your PATH."
    echo "Please install Java 17 or later."
    exit 1
fi

echo "Starting Security Routing App..."
java -jar security-routing.jar
