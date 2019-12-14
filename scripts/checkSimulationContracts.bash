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
sed -e "s#import { TaskImpl } from \"./impl/TaskImpl.sol\";#import { TaskImplSimulation } from \"./impl/TaskImplSimulation.sol\";#"  EnigmaSimulation.sol > EnigmaSimulation.tmp && mv EnigmaSimulation.tmp EnigmaSimulation.sol
sed -e "s/contract Enigma is/contract EnigmaSimulation is/" EnigmaSimulation.sol > EnigmaSimulation.tmp && mv EnigmaSimulation.tmp EnigmaSimulation.sol
sed -e "s/WorkersImpl\./WorkersImplSimulation./g" EnigmaSimulation.sol > EnigmaSimulation.tmp && mv EnigmaSimulation.tmp EnigmaSimulation.sol
sed -e "s/TaskImpl\./TaskImplSimulation./g" EnigmaSimulation.sol > EnigmaSimulation.tmp && mv EnigmaSimulation.tmp EnigmaSimulation.sol

# Check if the existing EnigmaSimulation.sol matches the replacement version
if ! diff EnigmaSimulation.sol $CONTRACTSDIR/EnigmaSimulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv EnigmaSimulation.sol $CONTRACTSDIR/EnigmaSimulation.sol
	else 
		echo "Error: Enigma.sol and EnigmaSimulation.sol differ more than they should, here are the differences:";
		diff EnigmaSimulation.sol $CONTRACTSDIR/EnigmaSimulation.sol
		echo "Run this script with --fix to fix the differences automatically."
		rm -f EnigmaSimulation.sol
		popd > /dev/null 2>&1
		exit 1;
	fi
else
	rm -f EnigmaSimulation.sol
fi

# Comment out a block to support Simulation Mode in WorkersImpl.sol
sed -e '/require(verifyReportImpl/,/require(bytesToAddress(reportData/ s_^_//_' $IMPLDIR/WorkersImpl.sol > WorkersImplSimulation.sol
sed -e "s/library WorkersImpl /library WorkersImplSimulation /" WorkersImplSimulation.sol > WorkersImplSimulation.tmp && mv WorkersImplSimulation.tmp WorkersImplSimulation.sol

# Check if the existing WorkersImpl-Simulation matches the above substitution
if ! diff WorkersImplSimulation.sol $IMPLDIR/WorkersImplSimulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv WorkersImplSimulation.sol $IMPLDIR/WorkersImplSimulation.sol
	else
		echo "Error: WorkersImpl.sol and WorkersImplSimulation.sol differ more than they should, here are the differences:";
		diff WorkersImplSimulation.sol $IMPLDIR/WorkersImplSimulation.sol
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
sed -e "s/WorkersImpl\./WorkersImplSimulation./g" TaskImplSimulation.sol > TaskImplSimulation.tmp && mv TaskImplSimulation.tmp TaskImplSimulation.sol
sed -e "s/library TaskImpl /library TaskImplSimulation /" TaskImplSimulation.sol > TaskImplSimulation.tmp && mv TaskImplSimulation.tmp TaskImplSimulation.sol

# Check if the existing TaskImplSimulation.sol matches the replacement version
if ! diff TaskImplSimulation.sol $IMPLDIR/TaskImplSimulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv TaskImplSimulation.sol $IMPLDIR/TaskImplSimulation.sol
	else
		echo "Error: TaskImpl.sol and TaskImplSimulation.sol differ more than they should, here are the differences:";
		diff TaskImplSimulation.sol $IMPLDIR/TaskImplSimulation.sol
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
sed -e "s/WorkersImpl\./WorkersImplSimulation./g" PrincipalImplSimulation.sol > PrincipalImplSimulation.tmp && mv PrincipalImplSimulation.tmp PrincipalImplSimulation.sol
sed -e "s/library PrincipalImpl /library PrincipalImplSimulation /" PrincipalImplSimulation.sol > PrincipalImplSimulation.tmp && mv PrincipalImplSimulation.tmp PrincipalImplSimulation.sol

# Check if the existing PrincipalImplSimulation.sol matches the replacement version
if ! diff PrincipalImplSimulation.sol $IMPLDIR/PrincipalImplSimulation.sol > /dev/null 2>&1; then
	if [ $FIX = 1 ]; then
		mv PrincipalImplSimulation.sol $IMPLDIR/PrincipalImplSimulation.sol
	else
		echo "Error: PrincipalImpl.sol and PrincipalImplSimulation.sol differ more than they should, here are the differences:";
		diff PrincipalImplSimulation.sol $IMPLDIR/PrincipalImplSimulation.sol
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