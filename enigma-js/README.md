# Enigma JS

A universal Javascript client library for the Enigma Network

## Features

* Webpack 4 based.
* ES6 as a source.
* Exports in a [umd](https://github.com/umdjs/umd) format so the library works everywhere.
* ES6 test setup with [Mocha](http://mochajs.org/) and [Chai](http://chaijs.com/).
* Linting with [ESLint](http://eslint.org/).

## Process

```
ES6 source files
       |
       |
    webpack
       |
       +--- babel, eslint
       |
  ready to use
     library
  in umd format
```

*Have in mind that you have to build the library before publishing. The files under the `lib` folder are the ones that should be distributed.*

## Getting started

1. Build the library

    * Run `yarn install` to get the project's dependencies
    * Run `yarn build` to produce minified version of the library.
  
2. Development mode

    * Having all the dependencies installed run `yarn dev`. This command will generate an non-minified version of the library and will run a watcher so you get the compilation on file change.
  
3. Running the tests

    * Open one terminal at the root of the parent folder `enigma-contract` run the following:
    ```
    $ truffle develop
    ```
    * And once Truffle loads, run (in the truffle console):
    ```
    truffle(develop)> migrate --reset
    ```
    * On a separate terminal run: `yarn test` or use these options with the mocha command (e.g. in IntelliJ): `-r jsdom-global/register --require babel-register`

## Scripts

* `yarn build` - produces production version of the library under the `lib` folder
* `yarn dev` - produces development version of the library and runs a watcher
* `yarn test` - well ... it runs the tests :)
* `yarn test:watch` - same as above but in a watch mode
