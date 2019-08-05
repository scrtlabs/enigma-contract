// Fixes error "ReferenceError: regeneratorRuntime is not defined" from Jest
// See: https://github.com/facebook/jest/issues/3126#issuecomment-345949328
import "core-js/stable";
import "regenerator-runtime/runtime";