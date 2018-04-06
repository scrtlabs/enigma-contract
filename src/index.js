import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import Worker from './Worker'
import Register from './Register'
import {BrowserRouter as Router, Route} from 'react-router-dom';


const RouterMapping = () => (
    <Router>
        <div>
            <Route exact path='/' component={Register}/>
            <Route path='/mixer' component={App}/>
            <Route path='/worker' component={Worker}/>
        </div>
    </Router>
);
ReactDOM.render (
    <RouterMapping/>,
    document.getElementById ('root')
);
