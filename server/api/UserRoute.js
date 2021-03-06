const jwt = require("jsonwebtoken");
const request = require("request");
const requestPromise = require("request-promise");
const uuid = require("uuid/v4");

const AuthCacheController = require("../controllers/AuthCacheController");
const UserController = require("../controllers/UserController");
const TeamController = require("../controllers/TeamController");
const verifyUser = require("../modules/verifyUser");
const verifyToken = require("../modules/verifyToken");

module.exports = (app) => {
  const authCache = new AuthCacheController();
  const userController = new UserController();
  const teamController = new TeamController();

  const tokenizeUser = ((user, res) => {
    const userToken = {
      id: user.id,
      email: user.email,
    };
    jwt.sign(userToken, app.settings.secret, {
      expiresIn: 2592000 // a month
    }, (err, token) => {
      if (err) res.status(400).send(err);
      const userResponse = {
        id: user.id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        icon: user.icon,
        token,
      };
      return res.status(200).send(userResponse);
    });
  });

  /*
  ** [MASTER] Route to get all the users
  */
  app.get("/user", verifyToken, (req, res) => {
    if (!req.user.admin) {
      return res.status(401).send({ error: "Not Authorized" });
    }

    return userController.findAll()
      .then((users) => {
        return res.status(200).send(users);
      })
      .catch((error) => {
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route to get the user by id
  */
  app.get("/user/:id", (req, res) => {
    userController.findById(req.params.id)
      .then((user) => {
        return res.status(200).send(user);
      })
      .catch((error) => {
        if (error === "404") return res.status(404).send("The user is not found");
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route for creating a new user
  */
  app.post("/user", (req, res) => {
    if (!req.body.email || !req.body.password) return res.status(400).send("no email or password");

    const icon = req.body.name.substring(0, 1) + req.body.surname.substring(0, 1);
    const userObj = {
      name: req.body.name,
      surname: req.body.surname,
      email: req.body.email,
      password: req.body.password,
      active: false,
      icon: icon.toUpperCase(),
    };

    let user = {};
    return userController.createUser(userObj)
      .then((newUser) => {
        user = newUser;
        const newTeam = {
          user_id: user.id,
          name: `${user.name}'s space`
        };
        return teamController.createTeam(newTeam);
      })
      .then((team) => {
        return teamController.addTeamRole(team.id, user.id, "owner");
      })
      .then(() => {
        return tokenizeUser(user, res);
      })
      .catch((error) => {
        if (error.message === "409") return res.status(409).send("The email is already used");
        return res.status(400).send(error);
      });
  });

  // --------------------------------------
  /*
  ** Route for authenticating a oneaccount user
  */
  app.post("/user/oneaccount", async (req, res) => {
    if (!req.body.uuid || !req.body.token) return res.status(400).send("no token or uuid");
    let userObj = {};
    try {
      userObj = await authCache.get(req.body.uuid);
    } catch (error) {
      return res.status(400).send("Could not authenticate");
    }
    // verify token
    try {
      const options = {
        method: "POST",
        url: "https://api.oneaccount.app/widget/verify",
        headers: {
          authorization: `BEARER ${req.body.token}`,
          "content-type": "application/json"
        },
        body: {
          "uuid": req.body.uuid
        },
        json: true,
        resolveWithFullResponse: true
      };
      const response = await requestPromise(options);
      if (response.statusCode !== 200 || !response.body || !response.body.success) {
        return res.status(400).send("Token verification failed");
      }
    } catch (error) {
      return res.status(500).send("One account couldnt verify token");
    }

    // one account provides the same flow for sign up and sign in
    // so we can handle both here:
    // log in if exists
    try {
      const user = await userController.findByEmail(userObj.email);
      if (user && user.id) {
        const updatedUser = await userController.update(user.id, { lastLogin: new Date() });
        return tokenizeUser(updatedUser, res);
      }
    } catch (error) {
      // the user is not registered yet, continue to register
    }
    // otherwise register
    try {
      if (!userObj || !userObj.email) throw new Error("no email is provided");
      const user = await userController.createUser(userObj);
      const newTeam = {
        user_id: user.id,
        name: `${user.name}'s space`
      };
      const team = await teamController.createTeam(newTeam);
      await teamController.addTeamRole(team.id, user.id, "owner");
      return tokenizeUser(user, res);
    } catch (error) {
      if (error.message === "409") return res.status(409).send("The email is already used");
      return res.status(400).send(error);
    }
  });

  /*
  ** Route for creating a new oneaccount user
  */
  app.post("/user/oneaccount-callback", async (req, res) => {
    if (!req.body.email || !req.body.uuid) {
      return res.status(400).send("no email or uuid");
    }
    if (!req.body.firstName || !req.body.lastName) {
      return res.status(400).send("no firstName or lasName found");
    }

    const icon = req.body.firstName.substring(0, 1) + req.body.lastName.substring(0, 1);
    const userObj = {
      oneaccountId: req.body.userId,
      name: req.body.firstName,
      surname: req.body.lastName,
      email: req.body.email,
      // generate random password so no one can login using email/pass combination
      password: uuid(),
      active: false,
      icon: icon.toUpperCase(),
    };
    await authCache.set(req.body.uuid, userObj);
    return res.json({ success: true });
  });
  // --------------------------------------

  /*
  ** Route to delete a user
  */
  app.delete("/user/:id", verifyToken, (req, res) => {
    if (req.user.id !== parseInt(req.params.id, 0)) return res.status(401).send("Unauthorised user");
    let user = {};
    return userController.findById(req.params.id)
      .then((foundUser) => {
        user = foundUser;
        // delete the team if user is owner
        user.TeamRoles.forEach((teamRole) => {
          if (teamRole.role === "owner") {
            teamController.deleteTeam(teamRole.team_id);
          }
        });
      })
      .then(() => {
        return userController.deleteUser(user.id);
      })
      .then(() => {
        return res.status(200).send({});
      })
      .catch((error) => {
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route to process invitations
  */
  app.post("/user/invited", (req, res) => {
    if (!req.body.email || !req.body.password) return res.status(400).send("no email or password");

    const icon = req.body.name.substring(0, 1) + req.body.surname.substring(0, 1);

    const userObj = {
      email: req.body.email,
      password: req.body.password,
      name: req.body.name,
      surname: req.body.surname,
      icon: icon.toUpperCase(),
      active: true,
    };

    let user = {};

    return userController.createUser(userObj)
      .then((newUser) => {
        user = newUser;
        const newTeam = {
          user_id: user.id,
          name: `${user.name}'s space`
        };
        return teamController.createTeam(newTeam);
      })
      .then((team) => {
        return teamController.addTeamRole(team.id, user.id, "owner");
      })
      .then(() => {
        return tokenizeUser(user, res);
      })
      .catch((error) => {
        if (error.message === "409") return res.status(409).send("The email is already used");
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route to verify new users (not used atm)
  */
  app.get("/user/:id/verify", verifyUser, (req, res) => {
    return userController.update(req.params.id, { "active": true })
      .then((user) => {
        return res.status(200).send({
          id: user.id, name: user.name, active: user.active, token: req.token
        });
      })
      .catch((error) => {
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route to login users
  */
  app.post("/user/login", (req, res) => {
    if (!req.body.email || !req.body.password) return res.status(400).send("fields are missing");
    let user = {};
    return userController.login(req.body.email, req.body.password)
      .then((data) => {
        user = data;
        return userController.update(user.id, { lastLogin: new Date() });
      })
      .then(() => {
        return tokenizeUser(user, res);
      })
      .catch((error) => {
        if (error.message === "401") return res.status(401).send("The credentials are incorrect");
        if (error.message === "404") return res.status(404).send("The email is not registreded");
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route to relog users based on their tokens
  */
  app.post("/user/relog", verifyToken, (req, res) => {
    return userController.update(req.user.id, { lastLogin: new Date() })
      .then(() => {
        return res.status(200).send(req.user);
      });
  });
  // --------------------------------------

  /*
  ** Route to modify users' fields
  */
  app.put("/user/:id", (req, res) => {
    if (!req.body || !req.params.id) return res.status(400).send("Missing fields");
    return userController.update(req.params.id, req.body)
      .then((user) => {
        return res.status(200).send(user);
      })
      .catch((error) => {
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route to get all team invites for the user
  */
  app.get("/user/:id/teamInvites", verifyToken, (req, res) => {
    if (req.user.id !== parseInt(req.params.id, 0)) return res.status(401).send("unauthorised user");
    return userController.findById(req.params.id)
      .then((user) => {
        return userController.getTeamInvitesByUser(user.email);
      })
      .then((invites) => {
        return res.status(200).send(invites);
      })
      .catch((error) => {
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route to send a new feedback email
  */
  app.post("/user/feedback", (req, res) => {
    let { from } = req.body;
    if (!from) from = "Anonymous";

    const message = {
      "from": { "email": "info@depomo.com" },
      "subject": `${from} left us a feedback - ${req.body.email}`,
      "personalizations": [{
        "to": [{ email: "info@depomo.com" }]
      }],
      "content": [
        {
          "type": "text/plain",
          "value": req.body.data
        }
      ]
    };

    const options = {
      method: "POST",
      url: `${app.settings.sendgridHost}/mail/send`,
      body: JSON.stringify(message),
      headers: {
        authorization: `Bearer ${app.settings.sendgridKey}`,
        "content-type": "application/json"
      }
    };

    return request(options, (err) => {
      if (err) return res.status(400).send(err);
      return res.status(200).send({});
    });
  });
  // --------------------------------------

  /*
  ** Route to request a password reset email
  */
  app.post("/user/password/reset", (req, res) => {
    return userController.requestPasswordReset(req.body.email)
      .then((result) => {
        return res.status(200).send(result);
      })
      .catch((error) => {
        if (error.message === "404") {
          return res.status(404).send(error);
        }

        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  /*
  ** Route to change the password with a password reset link info
  */
  app.put("/user/password/change", (req, res) => {
    return userController.changePassword(req.body)
      .then((result) => {
        return res.status(200).send(result);
      })
      .catch((error) => {
        return res.status(400).send(error);
      });
  });
  // --------------------------------------

  return (req, res, next) => {
    next();
  };
};
