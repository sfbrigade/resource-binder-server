#!/usr/bin/env bash

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <first name> <last name> <email address>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

npx auth create-admin --config $SCRIPT_DIR/../auth.js --email $3 --name '$1 $2' --data '{"firstName":"$1","lastName":"$2"}'
