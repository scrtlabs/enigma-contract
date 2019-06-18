#!/bin/bash
git clone https://github.com/enigmampc/discovery-docker-network.git
cd discovery-docker-network/enigma-contract
docker build --build-arg GIT_BRANCH_CONTRACT=$TRAVIS_BRANCH -t enigmampc/enigma_contract:latest --no-cache .
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
docker push enigmampc/enigma_contract:latest
