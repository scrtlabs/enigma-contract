#!/bin/bash

# First, we test whether this version of bash supports arrays.
whotest[0]='test' || (echo 'Failure: arrays not supported in this version of bash.' && exit 2)

# Get the folder where this script is located
SELFDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# cd into this folder to reference files relative to it
pushd $SELFDIR > /dev/null 2>&1

# Load the list of tests to run. We provide a template of all the integration
# tests Enigma runs in testList.template.txt, and the user can override it by
# specifying testList.txt (which is not tracked in the repo). Either file 
# should contain the names of the testfiles to run in order, one per line.
if [ -f testList.txt ]; then
	tests="$(cat testList.txt)"
else
	tests="$(cat testList.template.txt)"
fi

# Tests will be run sequentially. If one fails, the script will exit with error
for test in ${tests[@]}; do
	if yarn test:integration ${test}; then
		continue
	else
		popd > /dev/null 2>&1
		exit 1
	fi
done

# silently return to the folder where this script was called from
popd > /dev/null 2>&1
