#!/bin/bash
git clone https://github.com/enigmampc/discovery-docker-network.git
cd discovery-docker-network/enigma-contract

if [[ ${TRAVIS_BRANCH} == "master" ]]; then
	TAG=latest
else
	# ${TRAVIS_BRANCH} == "develop"
	TAG=develop
fi

docker build --build-arg GIT_BRANCH_CONTRACT=$TRAVIS_BRANCH -t enigmampc/enigma_contract:${TAG} --no-cache .
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin

docker push enigmampc/enigma_contract:${TAG}
