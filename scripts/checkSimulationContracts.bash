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

# Replace what needs to be replaced in Enigma.sol to support Simulation
sed -e "s#import { WorkersImpl } from \"./impl/WorkersImpl.sol\";#import { WorkersImplSimulation } from \"./impl/WorkersImplSimulation.sol\";#" $CONTRACTSDIR/Enigma.sol > EnigmaSimulation.sol
sed -i "s/contract Enigma is/contract EnigmaSimulation is/" EnigmaSimulation.sol
sed -i "s/WorkersImpl\./WorkersImplSimulation./g" EnigmaSimulation.sol

# Check if the existing EnigmaSimulation.sol matches the replacement version
if ! diff EnigmaSimulation.sol $CONTRACTSDIR/EnigmaSimulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv EnigmaSimulation.sol $CONTRACTSDIR/EnigmaSimulation.sol
	else 
		echo "Error: Enigma.sol and EnigmaSimulation.sol differ more than they should.";
		echo "Run this script with --fix to fix the differences automatically."
		rm -f EnigmaSimulation.sol
		popd > /dev/null 2>&1
		exit 1;
	fi
else
	rm -f EnigmaSimulation.sol
fi

# Comment out a block to support Simulation Mode in WorkersImpl.sol
sed -e '/require(verifyReportImpl/,/require(signerQuote/ s_^_//_' $IMPLDIR/WorkersImpl.sol > WorkersImplSimulation.sol
sed -i "s/library WorkersImpl /library WorkersImplSimulation /" WorkersImplSimulation.sol

# Check if the existing WorkersImpl-Simulation matches the above substitution
if ! diff WorkersImplSimulation.sol $IMPLDIR/WorkersImplSimulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv WorkersImplSimulation.sol $IMPLDIR/WorkersImplSimulation.sol
	else
		echo "Error: WorkersImpl.sol and WorkersImplSimulation.sol differ more than they should.";
		echo "Run this script with --fix to fix the differences automatically."
		rm -f WorkersImplSimulation.sol
		popd > /dev/null 2>&1
		exit 1;
	fi
else
	rm -f WorkersImplSimulation.sol
fi

# Replace what needs to be replaced in TaskImpl.sol to support Simulation
sed -e "s#import { WorkersImpl } from \"./WorkersImpl.sol\";#import { WorkersImplSimulation } from \"./WorkersImplSimulation.sol\";#" $IMPLDIR/TaskImpl.sol > TaskImplSimulation.sol
sed -i "s/WorkersImpl\./WorkersImplSimulation./g" TaskImplSimulation.sol
sed -i "s/library TaskImpl /library TaskImplSimulation /" TaskImplSimulation.sol

# Check if the existing TaskImplSimulation.sol matches the replacement version
if ! diff TaskImplSimulation.sol $IMPLDIR/TaskImplSimulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv TaskImplSimulation.sol $IMPLDIR/TaskImplSimulation.sol
	else
		echo "Error: TaskImpl.sol and TaskImplSimulation.sol differ more than they should.";
		echo "Run this script with --fix to fix the differences automatically."
		rm -f TaskImplSimulation.sol
		popd > /dev/null 2>&1
		exit 1;
	fi
else
	rm -f TaskImplSimulation.sol
fi

# Replace what needs to be replaced in PrincipalImpl.sol to support Simulation
sed -e "s#import { WorkersImpl } from \"./WorkersImpl.sol\";#import { WorkersImplSimulation } from \"./WorkersImplSimulation.sol\";#" $IMPLDIR/PrincipalImpl.sol > PrincipalImplSimulation.sol
sed -i "s/WorkersImpl\./WorkersImplSimulation./g" PrincipalImplSimulation.sol
sed -i "s/library PrincipalImpl /library PrincipalImplSimulation /" PrincipalImplSimulation.sol

# Check if the existing PrincipalImplSimulation.sol matches the replacement version
if ! diff PrincipalImplSimulation.sol $IMPLDIR/PrincipalImplSimulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv PrincipalImplSimulation.sol $IMPLDIR/PrincipalImplSimulation.sol
	else
		echo "Error: PrincipalImpl.sol and PrincipalImplSimulation.sol differ more than they should.";
		echo "Run this script with --fix to fix the differences automatically."
		rm -f PrincipalImplSimulation.sol
		popd > /dev/null 2>&1
		exit 1;
	fi
else
	rm -f PrincipalImplSimulation.sol
fi

# return to the folder where this script was called from
popd > /dev/null 2>&1