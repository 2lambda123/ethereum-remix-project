#!/usr/bin/env bash

set -e

setupRemixd () {
  mkdir remixdSharedfolder
  cd apps/remix-ide/contracts
  echo 'sharing folder: '
  echo $PWD
  ../../../node_modules/.bin/remixd -s $PWD --remix-ide http://127.0.0.1:4200 &
  cd ../../..
}

BUILD_ID=${CIRCLE_BUILD_NUM:-${TRAVIS_JOB_NUMBER}}
echo "$BUILD_ID"
TEST_EXITCODE=0

npm run ganache-cli &
npm run serve &
setupRemixd

sleep 5

npm run nightwatch_local_runAndDeploy || TEST_EXITCODE=1

echo "$TEST_EXITCODE"
if [ "$TEST_EXITCODE" -eq 1 ]
then
  exit 1
fi
