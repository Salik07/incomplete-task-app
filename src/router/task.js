const express = require("express");
const multer = require("multer");

const Task = require("../models/task");
const auth = require("../middleware/auth");

const router = new express.Router();

const storage = multer.diskStorage({
  destination: "./public/uploads",
  filename(req, file, cb) {
    // cb(null, file.fieldname + "-" + Date.now() + "-" + file.originalname);
    cb(null, file.fieldname + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1000000
  },
  fileFilter(req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
      return cb(new Error("Please upload an image."));
    }

    cb(undefined, true);
  }
});

router.post("/tasks", auth, upload.single("taskImage"), async (req, res) => {
  const task = new Task({
    ...req.body,
    taskImage: (req.file && req.file.path) || "",
    owner: req.user._id
  });

  try {
    await task.save();
    res.status(201).send(task);
  } catch (e) {
    res.status(400).send(e);
  }
});

// GET /tasks?completed=true
// GET /tasks?limit=10&skip=20
// GET /tasks?sortBy=createdAt:desc
router.get("/tasks", auth, async (req, res) => {
  const match = {};
  const sort = {};
  let date = {};

  if (req.query.completed) {
    match.completed = req.query.completed === "true";
  }

  if (req.query.from_date) {
    date = {
      ...date,
      $gte: new Date(req.query.from_date)
    };

    match["date"] = date;
  }

  if (req.query.to_date) {
    date = {
      ...date,
      $lte: new Date(req.query.to_date)
    };

    match["date"] = date;
  }

  if (req.query.sortBy) {
    const parts = req.query.sortBy.split(":");

    sort[parts[0]] = parts[1] === "desc" ? -1 : 1;
  }

  try {
    await req.user
      .populate({
        path: "tasks",
        match,
        options: {
          limit: parseInt(req.query.limit),
          skip: parseInt(req.query.skip),
          sort
        }
      })
      .execPopulate();

    res.send(req.user.tasks);
  } catch (e) {
    res.status(500).send();
  }
});

router.get("/tasks/:id", auth, async (req, res) => {
  const _id = req.params.id;

  try {
    const task = await Task.findOne({ _id, owner: req.user._id });

    if (!task) {
      return res.status(404).send();
    }

    res.send(task);
  } catch (e) {
    res.status(500).send();
  }
});

router.patch(
  "/tasks/:id",
  auth,
  upload.single("taskImage"),
  async (req, res) => {
    const updates = Object.keys(req.body);
    const allowedUpdates = ["description", "completed", "taskImage"];
    const isValidOperation = updates.every(update =>
      allowedUpdates.includes(update)
    );

    if (!isValidOperation) {
      return res.status(400).send({ error: "Invalid updates" });
    }

    try {
      const task = await Task.findOne({
        _id: req.params.id,
        owner: req.user._id
      });

      if (!task) {
        return res.status(404).send();
      }

      if (req.file && req.file.path) {
        task["taskImage"] = req.file.path;
      }

      updates.forEach(update => (task[update] = req.body[update]));
      await task.save();

      res.send(task);
    } catch (e) {
      res.status(400).send(e);
    }
  }
);

router.delete("/tasks/:id", auth, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      owner: req.user._id
    });

    if (!task) {
      return res.status(404).send();
    }

    res.send(task);
  } catch (e) {
    res.status(500).send();
  }
});

router.post("/delete-multi-tasks", auth, async (req, res) => {
  try {
    const tasks = await Task.deleteMany({
      _id: { $in: req.body.tasks },
      owner: req.user._id
    });

    res.send(tasks);
  } catch (e) {
    res.status(400).send(e);
  }
});

module.exports = router;
