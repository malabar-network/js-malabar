# Malabar JS Client

This repository contains the primary implementation (at the moment) for the Malabar client. It is written in JavaScript so that it can run both from Node.js and the browser. Right now it relies on some Node.js libraries, but with a few modifications it should be able to run on the browser.

# TODO

- Unit testing
- Message transport nodes
  - Hide Ethereum addresses of transport nodes
  - Scramble order of transport nodes
  - Create fake transport nodes for both sender and receiver nodes to conceal their ip addresses/peer ids
- e2e encryption between sender and receiver
