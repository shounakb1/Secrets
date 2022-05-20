//Requiring Modules
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const ejs = require("ejs");

//Requiring authentication related Modules
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const findOrCreate = require("mongoose-findorcreate");

//OAuth authentication strategies
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;

const app = express();

//setting view engine to ejs
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(express.static("public"));

//setting up session
app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

//initializing passport
app.use(passport.initialize());

//Using passport for session
app.use(passport.session());

//connect to mongoose Server
mongoose.connect("mongodb://localhost:27017/userDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  autoIndex: false
});
mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);

//creating secretSchema
const secretSchema = new mongoose.Schema({
  secret: String
});

//creating secret model from secretSchema
const Secret = new mongoose.model("Secret", secretSchema);

//creating userSchema it has a field secrets which is list of secret
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  facebookId: String,
  twitterId: String,
  secrets: [secretSchema]
});

//Adding plugin to schema
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

//creating User model from userSchema
const User = new mongoose.model("User", userSchema);

//Using passportLocalMongoose to create a local login strategy
passport.use(User.createStrategy());

//setting passport to serialize user. This creates cookie
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

//setting passport to deserialize user. This destroys cookie
passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

//setting up configuration code of google strategy
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({
      googleId: profile.id,
      username: profile.displayName
    }, function(err, user) {
      return cb(err, user);
    });
  }
));

//setting up configuration code of facebook strategy
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/secrets"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({
      facebookId: profile.id
    }, function(err, user) {
      return cb(err, user);
    });
  }
));

//setting up configuration code of Twitter strategy
passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: "http://localhost:3000/auth/twitter/secrets"
  },
  function(token, tokenSecret, profile, cb) {
    User.findOrCreate({
      twitterId: profile.id,
      username: profile.displayName
    }, function(err, user) {
      return cb(err, user);
    });
  }
));

//Hanling get request to home route
app.get("/", function(req, res) {
  res.render("home");
});

//Handling get request when user clicks on login/SignUp with google
app.get("/auth/google", passport.authenticate('google', {

  scope: ['profile']

}));

//google will make this get request after authentication
app.get("/auth/google/secrets",
  passport.authenticate('google', {
    failureRedirect: "/login"
  }),
  function(req, res) {
    res.redirect('/secrets');
  });

//Handling get request when user clicks on login/SignUp with facebook
app.get('/auth/facebook',
  passport.authenticate('facebook'));

//facebook will make this get request after authentication
app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', {
    failureRedirect: '/login'
  }),
  function(req, res) {
    res.redirect('/secrets');
  });

//Handling get request when user clicks on login/SignUp with twitter
app.get('/auth/twitter',
  passport.authenticate('twitter'));

//twitter will make this get request after authentication
app.get('/auth/twitter/secrets',
  passport.authenticate('twitter', {
    failureRedirect: '/login'
  }),
  function(req, res) {
    res.redirect('/secrets');
  });

//Handling get request to login page
app.get("/login", function(req, res) {
  res.render("login");
});

//Handling get request to register page
app.get("/register", function(req, res) {
  res.render("register");
});

//Handling get request to secrets page which does not require authentication
//authentication is required only to submit a new secret and to see/delete your own secrets
app.get("/secrets", function(req, res) {
  User.find({
    "secrets": {
      $ne: null
    }
  }, function(err, foundUsers) {
    if (err) {
      console.log(err);
    } else {
      if (foundUsers) {
        res.render("secrets", {
          usersWithSecrets: foundUsers
        });
      }
    }
  });
});

//Handling get request to submit route
app.get("/submit", function(req, res) {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/login");
  }
});

//Hanling get request to yourSecrets route
//if a user wants to see what secrets he has submitted
app.get("/yourSecrets", function(req, res) {
  if (req.isAuthenticated()) {
    User.findById(req.user.id, function(err, foundUser) {
      res.render("yourSecrets", {
        yourSecrets: foundUser.secrets
      });
    });
  } else {
    res.redirect("/login");
  }
});

//Hanling post request to delete route
//if a user wants to delete a secret he has submitted
app.post("/delete", function(req, res) {
  if (req.isAuthenticated()) {
    User.findOneAndUpdate({
      _id: req.user.id
    }, {
      $pull: {
        secrets: {
          _id: req.body.checkBox
        }
      }
    }, function(err, foundList) {
      if (!err) {
        res.redirect("/yourSecrets");
      }
    });
  } else {
    res.redirect("/login");
  }
});

//Hanling post request to submit route
//saving new secret to the user secrets field which is an array of secret
app.post("/submit", function(req, res) {
  const sumittedSecret = req.body.secret;
  const newSecret = new Secret({
    secret: sumittedSecret
  });
  User.findById(req.user.id, function(err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.secrets.push(newSecret);
        foundUser.save(function() {
          res.redirect("/secrets");
        });
      }
    }
  });
});

//deauthenticating when user logout i.e. deleting the cookie
app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

//Hanling post request to register route
app.post("/register", function(req, res) {
  User.register({
    username: req.body.username,
  }, req.body.password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect("/register");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/secrets");
      });
    }
  });
});

//Hanling post request to login route
app.post("/login", function(req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err) {
    if (err)
      console.log(err);
    else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/secrets");
      });
    }
  });

});

//setting up server to listen to port 3000
app.listen(3000, function() {
  console.log("Server started on port 3000");
});
