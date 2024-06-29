#!/bin/bash

mkdir -p echidna-reports

# Set your Solidity version here
SOLC_VERSION="0.8.19"  # Replace with your actual version

for file in contracts/*.sol; do
  contract=$(basename $file .sol)
  echo "Testing $contract..."
  docker run --rm --platform linux/amd64 \
    -v $PWD:/code \
    -w /code \
    -e SOLC_VERSION=$SOLC_VERSION \
    trailofbits/echidna \
    /bin/bash -c "solc-select install $SOLC_VERSION && solc-select use $SOLC_VERSION && echidna-test $file --contract $contract --config echidna.config.yml" \
    > echidna-reports/$contract.txt 2>&1
done