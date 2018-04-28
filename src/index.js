import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import {BrowserRouter as Router, Route} from 'react-router-dom';


const RouterMapping = () => (
    <Router>
        <div>
            <Route exact path='/' component={App}/>
        </div>
    </Router>
);
ReactDOM.render (
    <RouterMapping/>,
    document.getElementById ('root')
);
