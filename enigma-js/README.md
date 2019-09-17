# Enigma JS

A universal Javascript client library for the Enigma Network

## Features

* Webpack 4 based.
* ES6 as a source.
* Exports in a [umd](https://github.com/umdjs/umd) format so the library works everywhere.
* ES6 test setup with [Jest](https://jestjs.io/).
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

1. Install the following packages globally:
    ```
    yarn global add ganache-cli truffle
    ```
2. Install the package dependencies

    * On the parent folder, run `yarn install` to install the project dependencies.

2. Install the client library dependencies

    * Run `yarn install` to get the client library dependencies on the current folder
  
3. [OPTIONAL] Development mode

    * Having all the dependencies installed run `yarn dev`. This command will generate an non-minified version of the library and will run a watcher so you get the compilation on file change.
  
4. Running the tests

    * Open one terminal at the root of the parent folder `enigma-contract` run the following:
    ```
    $ ganache-cli -p 9545 -i 4447 &
    ```
    * And once Ganache-cli has started, run:
    ```
    $ truffle migrate --reset
    ```
    * On a separate terminal run: 
    ```
    yarn test
    ```
    
5. Build the library

    * Run `yarn build` to produce minified version of the library. It will check code quality before building (ESLint) and it will also run all tests afterwards (see prior step) and output a code coverage report.


## Scripts

* `yarn build` - produces production version of the library under the `lib` folder
* `yarn dev` - produces development version of the library and runs a watcher
* `yarn test` - well ... it runs the tests :)
* `yarn test:watch` - same as above but in a watch mode
