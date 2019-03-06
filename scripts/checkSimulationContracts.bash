#!/bin/bash

# Check if script is called with the '--fix' parameter
if [ "$1" == "--fix" ]; then FIX=1; else FIX=0; fi

# Get the folder where the script is located
SELFDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# cd into that folder to reference folders relative to it
pushd $SELFDIR > /dev/null 2>&1

# contracts folder relative to where this script is located
CONTRACTSDIR='../contracts';
IMPLDIR="$CONTRACTSDIR/impl";

# Replace the one line that needs to be replaced in Enigma.sol to support Simulation
sed -e "s#import { WorkersImpl } from \"./impl/WorkersImpl.sol\";#import { WorkersImpl } from \"./impl/WorkersImpl-Simulation.sol\";#" $CONTRACTSDIR/Enigma.sol > Enigma-Simulation.sol

# Check if the existing Enigma-Simulation.sol matches this one-line substitution
if ! diff Enigma-Simulation.sol $CONTRACTSDIR/Enigma-Simulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv Enigma-Simulation.sol $CONTRACTSDIR/Enigma-Simulation.sol
	else 
		echo "Error: Enigma.sol and Enigma-Simulation.sol differ more than they should."; 
		echo "Run this script with --fix to fix the differences automatically."
		rm -f Enigma-Simulation.sol
		popd > /dev/null 2>&1
		exit 1;
	fi
fi

# Comment out a block to support Simulation Mode in WorkersImpl.sol
sed -e '/require(verifyReportImpl/,/require(signerQuote/ s_^_//_' $IMPLDIR/WorkersImpl.sol > WorkersImpl-Simulation.sol

# Check if the existing WorkersImpl-Simulation matches the above substitution
if ! diff WorkersImpl-Simulation.sol $IMPLDIR/WorkersImpl-Simulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv WorkersImpl-Simulation.sol $IMPLDIR/WorkersImpl-Simulation.sol
	else		
		echo "Error: WorkersImpl.sol and WorkersImpl-Simulation.sol differ more than they should."; 
		echo "Run this script with --fix to fix the differences automatically."
		rm -f WorkersImpl-Simulation.sol
		popd > /dev/null 2>&1
		exit 1;
	fi
fi

# return to the folder where this script was called from
popd > /dev/null 2>&1