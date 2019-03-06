#!/usr/bin/env bash
CORE_PATH=./../../enigma-core-internal
echo -e "Copying built contracts to enigma-core in local path: $CORE_PATH...\n"
cp -v ./../build/contracts/Enigma.json $CORE_PATH/enigma-principal/app/tests/principal_node/contracts/
cp -v ./../build/contracts/EnigmaToken.json $CORE_PATH/enigma-principal/app/tests/principal_node/contracts/
echo "Contracts copied successfully"
