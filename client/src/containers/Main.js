import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { Route, Switch, withRouter } from "react-router";
import { Grid, Container } from "semantic-ui-react";

import ProjectBoard from "./ProjectBoard";
import Signup from "./Signup";
import VerifyUser from "./VerifyUser";
import Login from "./Login";
import UserDashboard from "./UserDashboard";
import ManageTeam from "./ManageTeam";
import UserInvite from "./UserInvite";
import ManageUser from "./ManageUser";
import FeedbackForm from "../components/FeedbackForm";
import PublicDashboard from "./PublicDashboard";
import PasswordReset from "./PasswordReset";
import EmbeddedChart from "./EmbeddedChart";

import { relog, getUser } from "../actions/user";
import { getTeams } from "../actions/team";
import { getAllProjects } from "../actions/project";
import { cleanErrors as cleanErrorsAction } from "../actions/error";

/*
  Description
*/
class Main extends Component {
  componentDidMount() {
    const {
      relog, getUser, getTeams, getAllProjects, location, cleanErrors,
    } = this.props;

    cleanErrors();
    if (!location.pathname.match(/\/chart\/\d+\/embedded/g)) {
      relog().then((data) => {
        getUser(data.id);
        getTeams(data.id);
        return getAllProjects();
      });
    }
  }

  render() {
    return (
      <div style={styles.container}>
        <div>
          <Switch>
            <Route exact path="/" component={UserDashboard} />
            <Route exact path="/b/:brewName" component={PublicDashboard} />
            <Route
              exact
              path="/feedback"
              render={() => (
                <Grid centered padded>
                  <Container textAlign="left" text>
                    <FeedbackForm />
                  </Container>
                </Grid>
              )}
            />
            <Route exact path="/manage/:teamId" component={ManageTeam} />
            <Route exact path="/:teamId/:projectId" component={ProjectBoard} />
            <Route exact path="/signup" component={Signup} />
            <Route exact path="/verify" component={VerifyUser} />
            <Route exact path="/login" component={Login} />
            <Route exact path="/user" component={UserDashboard} />
            <Route exact path="/profile" component={ManageUser} />
            <Route exact path="/edit" component={ManageUser} />
            <Route exact path="/passwordReset" component={PasswordReset} />
            <Route exact path="/manage/:teamId/members" component={ManageTeam} />
            <Route exact path="/manage/:teamId/settings" component={ManageTeam} />
            <Route exact path="/:teamId/:projectId/dashboard" component={ProjectBoard} />
            <Route exact path="/:teamId/:projectId/connections" component={ProjectBoard} />
            <Route exact path="/:teamId/:projectId/chart" component={ProjectBoard} />
            <Route exact path="/:teamId/:projectId/chart/:chartId/edit" component={ProjectBoard} />
            <Route exact path="/invite" component={UserInvite} />
            <Route exact path="/:teamId/:projectId/projectSettings" component={ProjectBoard} />
            <Route exact path="/:teamId/:projectId/members" component={ProjectBoard} />
            <Route exact path="/:teamId/:projectId/settings" component={ProjectBoard} />
            <Route exact path="/:teamId/:projectId/public" component={ProjectBoard} />
            <Route exact path="/chart/:chartId/embedded" component={EmbeddedChart} />
          </Switch>
        </div>
      </div>
    );
  }
}

const styles = {
  container: {
    flex: 1,
  },
};

Main.propTypes = {
  relog: PropTypes.func.isRequired,
  getUser: PropTypes.func.isRequired,
  getTeams: PropTypes.func.isRequired,
  getAllProjects: PropTypes.func.isRequired,
  location: PropTypes.object.isRequired,
  cleanErrors: PropTypes.func.isRequired,
};

const mapStateToProps = (state) => {
  return {
    user: state.user,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    relog: () => dispatch(relog()),
    getUser: (id) => dispatch(getUser(id)),
    getAllProjects: () => dispatch(getAllProjects()),
    getTeams: (id) => dispatch(getTeams(id)),
    cleanErrors: () => dispatch(cleanErrorsAction()),
  };
};

export default withRouter(connect(mapStateToProps, mapDispatchToProps)(Main));
