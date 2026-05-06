const express = require("express");
const http = require("http");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3000;
const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"));
const studentNames = [
  "araujo jimenez deiby",
  "arevalo caita juan andres",
  "barragan silva luis fernando",
  "barrantes castro juan esteban",
  "coneo rojas kleber andres",
  "correa nuñez felipe",
  "cuello molina ian asaned",
  "cuy obando danna valentina",
  "diaz lazaro nadal alejandro",
  "doza perdomo david alfonso",
  "fuentes godoy david antonio jr",
  "hernandez rodriguez maria jose",
  "higuera beltran dario andres",
  "hincapie ussa juan daniel",
  "larrota grandas juan jose",
  "marquez navarro julio alberto",
  "martinez blanco eddy santiago",
  "moncada ferro juan david",
  "mongui ortiz sergio joseph",
  "naranjo bautista laura daniela",
  "olivera pineda yeannis",
  "ordonez rojas aaron david",
  "pereira enamorado leonardo",
  "piñeros prado mauricio",
  "quesada pacheco joel",
  "reinoso esquivel angel amadeus",
  "ricuarte segura sebastian alejandro",
  "silva mondragon jhon esteban",
  "sogamoso martinez brayan estiven",
  "tapia angel stefany",
  "veles betancourt nathalia",
  "villada lopez dominic alexander",
];
const subjects = [
  "Trigonometria",
  "Quimica",
  "Fisica",
  "Educacion fisica",
  "Filosofia",
  "Español",
  "Etica",
  "Metodologia de la Investigacion",
  "Ciencias Politicas",
  "Musica",
  "Electronica",
  "Tecnologia",
  "Introduccion a la Informatica",
  "Programacion Orientada a Objetos",
  "Ingles",
];

app.use(express.json({ limit: "80mb" }));
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.static(__dirname));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      present INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const insertStudent = db.prepare("INSERT OR IGNORE INTO students (name) VALUES (?)");
  studentNames.forEach((name) => insertStudent.run(name));
  insertStudent.finalize();

  db.run(`
    CREATE TABLE IF NOT EXISTS grades (
      student_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      grade REAL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id, subject),
      FOREIGN KEY (student_id) REFERENCES students (id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS grade_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      grade REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students (id)
    )
  `);

  db.run(`
    INSERT INTO grade_entries (student_id, subject, grade)
    SELECT student_id, subject, grade
    FROM grades
    WHERE grade IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM grade_entries
        WHERE grade_entries.student_id = grades.student_id
          AND grade_entries.subject = grades.subject
      )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run("ALTER TABLE community_posts ADD COLUMN image_data TEXT", () => {});
  db.run("ALTER TABLE community_posts ADD COLUMN images_data TEXT", () => {});
  db.run("ALTER TABLE community_posts ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0", () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS community_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pending_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run("ALTER TABLE pending_tasks ADD COLUMN image_data TEXT", () => {});
  db.run("ALTER TABLE pending_tasks ADD COLUMN images_data TEXT", () => {});
  db.run("ALTER TABLE pending_tasks ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0", () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS pending_task_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES pending_tasks (id) ON DELETE CASCADE
    )
  `);
});

function normalizeImages(row) {
  let images = [];

  if (row.images_data) {
    try {
      const parsedImages = JSON.parse(row.images_data);
      if (Array.isArray(parsedImages)) {
        images = parsedImages.filter(Boolean);
      }
    } catch (error) {
      images = [];
    }
  }

  if (images.length === 0 && row.image_data) {
    images.push(row.image_data);
  }

  return images;
}

function readImagesFromBody(body) {
  const images = Array.isArray(body.imagesData)
    ? body.imagesData.map((image) => String(image || "").trim()).filter(Boolean)
    : [];
  const legacyImage = String(body.imageData || "").trim();

  if (legacyImage) {
    images.push(legacyImage);
  }

  return images.slice(0, 12);
}

function getStudents(callback) {
  db.all("SELECT * FROM students ORDER BY name ASC", (error, rows) => {
    callback(error, rows);
  });
}

function broadcastStudents() {
  getStudents((error, rows) => {
    if (!error) {
      io.emit("students:updated", rows);
    }
  });
}

app.get("/api/students", (req, res) => {
  getStudents((error, rows) => {
    if (error) {
      res.status(500).json({ error: "No se pudo cargar la lista." });
      return;
    }

    res.json(rows);
  });
});

app.patch("/api/students/:id", (req, res) => {
  const present = req.body.present ? 1 : 0;

  db.run(
    "UPDATE students SET present = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [present, req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo actualizar el estudiante." });
        return;
      }

      if (this.changes > 0) {
        broadcastStudents();
      }

      res.json({ updated: this.changes > 0 });
    }
  );
});

app.get("/api/students/:id/grades", (req, res) => {
  db.all(
    "SELECT id, subject, grade FROM grade_entries WHERE student_id = ? ORDER BY id ASC",
    [req.params.id],
    (error, rows) => {
      if (error) {
        res.status(500).json({ error: "No se pudieron cargar las notas." });
        return;
      }

      res.json(
        subjects.map((subject) => {
          const grades = rows
            .filter((row) => row.subject === subject)
            .map((row) => ({ id: row.id, value: row.grade }));
          const average =
            grades.length > 0
              ? grades.reduce((sum, grade) => sum + grade.value, 0) / grades.length
              : null;

          return { subject, grades, average };
        })
      );
    }
  );
});

app.post("/api/students/:id/grades", (req, res) => {
  const subject = String(req.body.subject || "").trim();
  const grade = Number(String(req.body.grade).replace(",", "."));

  if (!subjects.includes(subject)) {
    res.status(400).json({ error: "La materia no existe." });
    return;
  }

  if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
    res.status(400).json({ error: "La nota debe estar entre 0 y 5." });
    return;
  }

  db.run(
    "INSERT INTO grade_entries (student_id, subject, grade) VALUES (?, ?, ?)",
    [req.params.id, subject, grade],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo guardar la nota." });
        return;
      }

      io.emit("grades:updated", { studentId: Number(req.params.id) });
      res.status(201).json({ id: this.lastID, subject, value: grade });
    }
  );
});

app.put("/api/students/:id/grades/:gradeId", (req, res) => {
  const grade = Number(String(req.body.grade).replace(",", "."));

  if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
    res.status(400).json({ error: "La nota debe estar entre 0 y 5." });
    return;
  }

  db.run(
    "UPDATE grade_entries SET grade = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND student_id = ?",
    [grade, req.params.gradeId, req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo editar la nota." });
        return;
      }

      io.emit("grades:updated", { studentId: Number(req.params.id) });
      res.json({ updated: this.changes > 0 });
    }
  );
});

app.delete("/api/students/:id/grades/:gradeId", (req, res) => {
  db.run(
    "DELETE FROM grade_entries WHERE id = ? AND student_id = ?",
    [req.params.gradeId, req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo borrar la nota." });
        return;
      }

      io.emit("grades:updated", { studentId: Number(req.params.id) });
      res.json({ deleted: this.changes > 0 });
    }
  );
});

function getCommunityPosts(callback) {
  db.all(
    `
      SELECT
        posts.id AS post_id,
        posts.content AS post_content,
        posts.created_at AS post_created_at,
        posts.updated_at AS post_updated_at,
        posts.image_data AS post_image_data,
        posts.images_data AS post_images_data,
        posts.likes_count AS post_likes_count,
        comments.id AS comment_id,
        comments.content AS comment_content,
        comments.created_at AS comment_created_at,
        comments.updated_at AS comment_updated_at
      FROM community_posts posts
      LEFT JOIN community_comments comments ON comments.post_id = posts.id
      ORDER BY posts.id DESC, comments.id ASC
    `,
    (error, rows) => {
      if (error) {
        callback(error);
        return;
      }

      const postMap = new Map();
      rows.forEach((row) => {
        if (!postMap.has(row.post_id)) {
          postMap.set(row.post_id, {
            id: row.post_id,
            content: row.post_content,
            created_at: row.post_created_at,
            updated_at: row.post_updated_at,
            image_data: row.post_image_data,
            images: normalizeImages({
              image_data: row.post_image_data,
              images_data: row.post_images_data,
            }),
            likes_count: row.post_likes_count || 0,
            comments: [],
          });
        }

        if (row.comment_id) {
          postMap.get(row.post_id).comments.push({
            id: row.comment_id,
            content: row.comment_content,
            created_at: row.comment_created_at,
            updated_at: row.comment_updated_at,
          });
        }
      });

      callback(null, Array.from(postMap.values()));
    }
  );
}

function broadcastCommunity() {
  getCommunityPosts((error, posts) => {
    if (!error) {
      io.emit("community:updated", posts);
    }
  });
}

app.get("/api/community/posts", (req, res) => {
  getCommunityPosts((error, posts) => {
    if (error) {
      res.status(500).json({ error: "No se pudo cargar la comunidad." });
      return;
    }

    res.json(posts);
  });
});

app.post("/api/community/posts", (req, res) => {
  const content = String(req.body.content || "").trim();
  const images = readImagesFromBody(req.body);

  if (!content && images.length === 0) {
    res.status(400).json({ error: "La publicacion no puede estar vacia." });
    return;
  }

  db.run(
    "INSERT INTO community_posts (content, image_data, images_data) VALUES (?, ?, ?)",
    [content, images[0] || null, JSON.stringify(images)],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo publicar." });
        return;
      }

      broadcastCommunity();
      res.status(201).json({
        id: this.lastID,
        content,
        image_data: images[0] || null,
        images,
        likes_count: 0,
      });
    }
  );
});

app.post("/api/community/posts/:id/like", (req, res) => {
  db.run(
    "UPDATE community_posts SET likes_count = likes_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo registrar el me gusta." });
        return;
      }

      broadcastCommunity();
      res.json({ updated: this.changes > 0 });
    }
  );
});

app.put("/api/community/posts/:id", (req, res) => {
  const content = String(req.body.content || "").trim();

  if (!content) {
    res.status(400).json({ error: "La publicacion no puede estar vacia." });
    return;
  }

  db.run(
    "UPDATE community_posts SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [content, req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo editar la publicacion." });
        return;
      }

      broadcastCommunity();
      res.json({ updated: this.changes > 0 });
    }
  );
});

app.delete("/api/community/posts/:id", (req, res) => {
  db.serialize(() => {
    db.run("DELETE FROM community_comments WHERE post_id = ?", [req.params.id]);
    db.run("DELETE FROM community_posts WHERE id = ?", [req.params.id], function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo borrar la publicacion." });
        return;
      }

      broadcastCommunity();
      res.json({ deleted: this.changes > 0 });
    });
  });
});

app.post("/api/community/posts/:id/comments", (req, res) => {
  const content = String(req.body.content || "").trim();

  if (!content) {
    res.status(400).json({ error: "El comentario no puede estar vacio." });
    return;
  }

  db.run(
    "INSERT INTO community_comments (post_id, content) VALUES (?, ?)",
    [req.params.id, content],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo comentar." });
        return;
      }

      broadcastCommunity();
      res.status(201).json({ id: this.lastID, content });
    }
  );
});

app.put("/api/community/comments/:id", (req, res) => {
  const content = String(req.body.content || "").trim();

  if (!content) {
    res.status(400).json({ error: "El comentario no puede estar vacio." });
    return;
  }

  db.run(
    "UPDATE community_comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [content, req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo editar el comentario." });
        return;
      }

      broadcastCommunity();
      res.json({ updated: this.changes > 0 });
    }
  );
});

app.delete("/api/community/comments/:id", (req, res) => {
  db.run("DELETE FROM community_comments WHERE id = ?", [req.params.id], function (error) {
    if (error) {
      res.status(500).json({ error: "No se pudo borrar el comentario." });
      return;
    }

    broadcastCommunity();
    res.json({ deleted: this.changes > 0 });
  });
});

function getPendingTasks(callback) {
  db.all(
    `
      SELECT
        tasks.id AS task_id,
        tasks.title AS task_title,
        tasks.done AS task_done,
        tasks.created_at AS task_created_at,
        tasks.updated_at AS task_updated_at,
        tasks.image_data AS task_image_data,
        tasks.images_data AS task_images_data,
        tasks.likes_count AS task_likes_count,
        comments.id AS comment_id,
        comments.content AS comment_content,
        comments.created_at AS comment_created_at,
        comments.updated_at AS comment_updated_at
      FROM pending_tasks tasks
      LEFT JOIN pending_task_comments comments ON comments.task_id = tasks.id
      ORDER BY tasks.done ASC, tasks.id DESC, comments.id ASC
    `,
    (error, rows) => {
      if (error) {
        callback(error);
        return;
      }

      const taskMap = new Map();
      rows.forEach((row) => {
        if (!taskMap.has(row.task_id)) {
          taskMap.set(row.task_id, {
            id: row.task_id,
            title: row.task_title,
            done: row.task_done,
            created_at: row.task_created_at,
            updated_at: row.task_updated_at,
            image_data: row.task_image_data,
            images: normalizeImages({
              image_data: row.task_image_data,
              images_data: row.task_images_data,
            }),
            likes_count: row.task_likes_count || 0,
            comments: [],
          });
        }

        if (row.comment_id) {
          taskMap.get(row.task_id).comments.push({
            id: row.comment_id,
            content: row.comment_content,
            created_at: row.comment_created_at,
            updated_at: row.comment_updated_at,
          });
        }
      });

      callback(null, Array.from(taskMap.values()));
    }
  );
}

function broadcastPendingTasks() {
  getPendingTasks((error, rows) => {
    if (!error) {
      io.emit("pendingTasks:updated", rows);
    }
  });
}

app.get("/api/pending-tasks", (req, res) => {
  getPendingTasks((error, rows) => {
    if (error) {
      res.status(500).json({ error: "No se pudieron cargar las tareas." });
      return;
    }

    res.json(rows);
  });
});

app.post("/api/pending-tasks", (req, res) => {
  const title = String(req.body.title || "").trim();
  const images = readImagesFromBody(req.body);

  if (!title && images.length === 0) {
    res.status(400).json({ error: "La tarea no puede estar vacia." });
    return;
  }

  db.run(
    "INSERT INTO pending_tasks (title, image_data, images_data) VALUES (?, ?, ?)",
    [title, images[0] || null, JSON.stringify(images)],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo crear la tarea." });
        return;
      }

      broadcastPendingTasks();
      res.status(201).json({
        id: this.lastID,
        title,
        done: 0,
        image_data: images[0] || null,
        images,
        likes_count: 0,
        comments: [],
      });
    }
  );
});

app.post("/api/pending-tasks/:id/like", (req, res) => {
  db.run(
    "UPDATE pending_tasks SET likes_count = likes_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo registrar el me gusta." });
        return;
      }

      broadcastPendingTasks();
      res.json({ updated: this.changes > 0 });
    }
  );
});

app.post("/api/pending-tasks/:id/comments", (req, res) => {
  const content = String(req.body.content || "").trim();

  if (!content) {
    res.status(400).json({ error: "El comentario no puede estar vacio." });
    return;
  }

  db.run(
    "INSERT INTO pending_task_comments (task_id, content) VALUES (?, ?)",
    [req.params.id, content],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo comentar." });
        return;
      }

      broadcastPendingTasks();
      res.status(201).json({ id: this.lastID, content });
    }
  );
});

app.put("/api/pending-task-comments/:id", (req, res) => {
  const content = String(req.body.content || "").trim();

  if (!content) {
    res.status(400).json({ error: "El comentario no puede estar vacio." });
    return;
  }

  db.run(
    "UPDATE pending_task_comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [content, req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo editar el comentario." });
        return;
      }

      broadcastPendingTasks();
      res.json({ updated: this.changes > 0 });
    }
  );
});

app.delete("/api/pending-task-comments/:id", (req, res) => {
  db.run("DELETE FROM pending_task_comments WHERE id = ?", [req.params.id], function (error) {
    if (error) {
      res.status(500).json({ error: "No se pudo borrar el comentario." });
      return;
    }

    broadcastPendingTasks();
    res.json({ deleted: this.changes > 0 });
  });
});

app.put("/api/pending-tasks/:id", (req, res) => {
  const title = String(req.body.title || "").trim();

  if (!title) {
    res.status(400).json({ error: "La tarea no puede estar vacia." });
    return;
  }

  db.run(
    "UPDATE pending_tasks SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [title, req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo editar la tarea." });
        return;
      }

      broadcastPendingTasks();
      res.json({ updated: this.changes > 0 });
    }
  );
});

app.patch("/api/pending-tasks/:id", (req, res) => {
  const done = req.body.done ? 1 : 0;

  db.run(
    "UPDATE pending_tasks SET done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [done, req.params.id],
    function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo actualizar la tarea." });
        return;
      }

      broadcastPendingTasks();
      res.json({ updated: this.changes > 0 });
    }
  );
});

app.delete("/api/pending-tasks/:id", (req, res) => {
  db.serialize(() => {
    db.run("DELETE FROM pending_task_comments WHERE task_id = ?", [req.params.id]);
    db.run("DELETE FROM pending_tasks WHERE id = ?", [req.params.id], function (error) {
      if (error) {
        res.status(500).json({ error: "No se pudo borrar la tarea." });
        return;
      }

      broadcastPendingTasks();
      res.json({ deleted: this.changes > 0 });
    });
  });
});

io.on("connection", (socket) => {
  getStudents((error, rows) => {
    if (!error) {
      socket.emit("students:updated", rows);
    }
  });
});

server.listen(port, () => {
  console.log(`Aplicacion lista en http://localhost:${port}`);
});
