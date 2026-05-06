if (
  window.location.protocol === "file:" ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    window.location.port !== "3000")
) {
  window.location.replace("http://localhost:3000");
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.querySelector("#searchInput");
  const studentList = document.querySelector("#studentList");
  const message = document.querySelector("#message");
  const connectionStatus = document.querySelector("#connectionStatus");
  const totalCount = document.querySelector("#totalCount");
  const modal = document.querySelector("#gradeModal");
  const modalTitle = document.querySelector("#modalTitle");
  const closeModalButton = document.querySelector("#closeModalButton");
  const subjectList = document.querySelector("#subjectList");
  const averageValue = document.querySelector("#averageValue");
  const gradeMessage = document.querySelector("#gradeMessage");
  const tabButtons = document.querySelectorAll(".tab-button");
  const viewSections = document.querySelectorAll(".view-section");
  const postForm = document.querySelector("#postForm");
  const postInput = document.querySelector("#postInput");
  const postImageInput = document.querySelector("#postImageInput");
  const postList = document.querySelector("#postList");
  const communityMessage = document.querySelector("#communityMessage");
  const newPostButton = document.querySelector("#newPostButton");
  const pendingTaskForm = document.querySelector("#pendingTaskForm");
  const pendingTaskInput = document.querySelector("#pendingTaskInput");
  const pendingTaskImageInput = document.querySelector("#pendingTaskImageInput");
  const pendingTaskList = document.querySelector("#pendingTaskList");
  const pendingTaskMessage = document.querySelector("#pendingTaskMessage");
  const newTaskButton = document.querySelector("#newTaskButton");
  const socket = window.io ? window.io() : null;
  const defaultSubjects = [
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
  const passingGrade = 3;
  let students = readStudentsFromHtml();
  let selectedStudent = null;
  let selectedGrades = [];
  let posts = [];
  let pendingTasks = [];
  let isSavingGrade = false;

  function normalizeText(text) {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n");
  }

  function readStudentsFromHtml() {
    return Array.from(document.querySelectorAll(".student-name")).map(
      (studentName, index) => ({
        id: index + 1,
        name: studentName.textContent.trim(),
      })
    );
  }

  async function requestJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let response;
    let data;

    try {
      response = await fetch(url, { ...options, signal: controller.signal });
      data = await response.json().catch(() => ({}));
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(data.error || "Ocurrio un error.");
    }

    return data;
  }

  function showMessage(text = "") {
    message.textContent = text;
  }

  function showGradeMessage(text = "") {
    gradeMessage.textContent = text;
  }

  function showCommunityMessage(text = "") {
    communityMessage.textContent = text;
  }

  function showPendingTaskMessage(text = "") {
    pendingTaskMessage.textContent = text;
  }

  function switchView(viewId) {
    viewSections.forEach((section) => {
      section.hidden = section.id !== viewId;
    });

    tabButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === viewId);
    });
  }

  function formatName(name) {
    return name
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function parseGrade(value) {
    return Number(String(value).trim().replace(",", "."));
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    return new Date(`${value.replace(" ", "T")}Z`).toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function getFeedImages(item) {
    if (Array.isArray(item.images) && item.images.length > 0) {
      return item.images.filter(Boolean);
    }

    return item.image_data ? [item.image_data] : [];
  }

  function fileToImageData(file) {
    if (!file) {
      return Promise.resolve("");
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const maxWidth = 1280;
          const scale = Math.min(1, maxWidth / image.width);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };

        image.onerror = reject;
        image.src = reader.result;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function filesToImageDataList(fileList) {
    const files = Array.from(fileList || []).slice(0, 12);
    return Promise.all(files.map((file) => fileToImageData(file)));
  }

  function renderImageGallery(images, altText) {
    const gallery = document.createElement("div");
    gallery.className = `feed-gallery image-count-${Math.min(images.length, 4)}`;

    images.forEach((imageData, index) => {
      const imageWrap = document.createElement("button");
      const image = document.createElement("img");

      imageWrap.className = "feed-gallery-item";
      imageWrap.type = "button";
      image.src = imageData;
      image.alt = `${altText} ${index + 1}`;
      imageWrap.append(image);
      gallery.append(imageWrap);
    });

    return gallery;
  }

  function renderStudents() {
    const query = normalizeText(searchInput.value.trim());
    const visibleStudents = students.filter((student) =>
      normalizeText(student.name).includes(query)
    );

    studentList.innerHTML = "";
    totalCount.textContent = students.length;

    if (visibleStudents.length !== students.length) {
      showMessage(`${visibleStudents.length} resultado(s) encontrados.`);
    } else {
      showMessage();
    }

    if (visibleStudents.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty-item";
      emptyItem.textContent = "No hay estudiantes con ese nombre.";
      studentList.append(emptyItem);
      return;
    }

    visibleStudents.forEach((student, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const avatar = document.createElement("span");
      const title = document.createElement("span");

      item.className = "student-item";
      button.className = "student-button";
      button.type = "button";
      button.addEventListener("click", () => openGradeModal(student));

      avatar.className = "avatar";
      avatar.textContent = index + 1 < 10 ? `0${index + 1}` : String(index + 1);
      title.className = "student-name";
      title.textContent = formatName(student.name);

      button.append(avatar, title);
      item.append(button);
      studentList.append(item);
    });
  }

  function updateAverage() {
    const subjectAverages = selectedGrades
      .map((item) => item.average)
      .filter((average) => Number.isFinite(average));

    if (subjectAverages.length === 0) {
      averageValue.textContent = "Sin notas";
      return;
    }

    const average =
      subjectAverages.reduce((sum, grade) => sum + grade, 0) / subjectAverages.length;
    averageValue.textContent = average.toFixed(2);
  }

  function calculateSubjectAverage(item) {
    if (!item.grades || item.grades.length === 0) {
      return null;
    }

    return item.grades.reduce((sum, grade) => sum + grade.value, 0) / item.grades.length;
  }

  function findSelectedSubject(subject) {
    return selectedGrades.find((item) => item.subject === subject);
  }

  function renderGrades() {
    subjectList.innerHTML = "";
    updateAverage();

    selectedGrades.forEach((item) => {
      const row = document.createElement("article");
      const header = document.createElement("div");
      const subject = document.createElement("span");
      const status = document.createElement("span");
      const gradeList = document.createElement("div");
      const controls = document.createElement("div");
      const input = document.createElement("input");
      const addButton = document.createElement("button");

      item.average = calculateSubjectAverage(item);

      row.className = "subject-item";
      row.classList.toggle("is-approved", item.average !== null && item.average >= passingGrade);
      row.classList.toggle("is-failed", item.average !== null && item.average < passingGrade);

      header.className = "subject-header";
      subject.className = "subject-name";
      subject.textContent = item.subject;
      status.className = "subject-status";
      status.textContent =
        item.average === null
          ? "Sin notas"
          : item.average >= passingGrade
            ? `Aprueba ${item.average.toFixed(2)}`
            : `No aprueba ${item.average.toFixed(2)}`;

      gradeList.className = "grade-list";
      if (!item.grades || item.grades.length === 0) {
        const emptyGrade = document.createElement("span");
        emptyGrade.className = "grade-empty";
        emptyGrade.textContent = "Sin notas agregadas";
        gradeList.append(emptyGrade);
      } else {
        item.grades.forEach((grade) => {
          const gradeItem = document.createElement("div");
          const gradeInput = document.createElement("input");
          const saveButton = document.createElement("button");
          const deleteButton = document.createElement("button");

          gradeItem.className = "grade-item";
          gradeInput.className = "grade-input";
          gradeInput.type = "text";
          gradeInput.inputMode = "decimal";
          gradeInput.value = grade.value;

          saveButton.type = "button";
          saveButton.textContent = "Editar";
          saveButton.addEventListener("click", () => updateGrade(grade, gradeInput));

          deleteButton.type = "button";
          deleteButton.className = "ghost-button";
          deleteButton.textContent = "Borrar";
          deleteButton.addEventListener("click", () => deleteGrade(grade));

          gradeItem.append(gradeInput, saveButton, deleteButton);
          gradeList.append(gradeItem);
        });
      }

      input.className = "grade-input";
      input.type = "text";
      input.inputMode = "decimal";
      input.placeholder = "Nueva nota";
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addGrade(item, input, addButton);
        }
      });

      addButton.type = "button";
      addButton.textContent = "Agregar";
      addButton.addEventListener("click", () => addGrade(item, input, addButton));

      header.append(subject, status);
      controls.className = "grade-controls";
      controls.append(input, addButton);
      row.append(header, gradeList, controls);
      subjectList.append(row);
    });
  }

  async function openGradeModal(student) {
    selectedStudent = student;
    modalTitle.textContent = formatName(student.name);
    modal.hidden = false;
    document.body.classList.add("has-modal");
    subjectList.innerHTML = '<p class="message">Cargando materias...</p>';
    showGradeMessage();

    try {
      selectedGrades = await requestJson(`/api/students/${student.id}/grades`);
      renderGrades();
    } catch (error) {
      selectedGrades = defaultSubjects.map((subject) => ({
        subject,
        grades: [],
        average: null,
      }));
      renderGrades();
      showGradeMessage("No se pudieron cargar notas guardadas, pero puedes agregar nuevas.");
    }
  }

  function closeGradeModal() {
    modal.hidden = true;
    document.body.classList.remove("has-modal");
    selectedStudent = null;
    selectedGrades = [];
  }

  async function addGrade(item, input, button) {
    const grade = parseGrade(input.value);

    if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
      showGradeMessage("La nota debe estar entre 0 y 5.");
      return;
    }

    try {
      isSavingGrade = true;
      button.disabled = true;
      button.textContent = "Guardando";
      const createdGrade = await requestJson(`/api/students/${selectedStudent.id}/grades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: item.subject, grade }),
      });
      const subject = findSelectedSubject(item.subject);

      if (subject) {
        subject.grades.push(createdGrade);
        subject.average = calculateSubjectAverage(subject);
      }

      input.value = "";
      renderGrades();
      showGradeMessage("Nota agregada.");
    } catch (error) {
      showGradeMessage(error.message);
    } finally {
      isSavingGrade = false;
      button.disabled = false;
      button.textContent = "Agregar";
    }
  }

  async function updateGrade(gradeItem, input) {
    const grade = parseGrade(input.value);

    if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
      showGradeMessage("La nota debe estar entre 0 y 5.");
      return;
    }

    try {
      isSavingGrade = true;
      await requestJson(`/api/students/${selectedStudent.id}/grades/${gradeItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });
      const subject = selectedGrades.find((item) =>
        item.grades.some((currentGrade) => currentGrade.id === gradeItem.id)
      );

      if (subject) {
        const currentGrade = subject.grades.find(
          (storedGrade) => storedGrade.id === gradeItem.id
        );
        currentGrade.value = grade;
        subject.average = calculateSubjectAverage(subject);
      }

      renderGrades();
      showGradeMessage("Nota editada.");
    } catch (error) {
      showGradeMessage(error.message);
    } finally {
      isSavingGrade = false;
    }
  }

  async function deleteGrade(gradeItem) {
    try {
      isSavingGrade = true;
      await requestJson(`/api/students/${selectedStudent.id}/grades/${gradeItem.id}`, {
        method: "DELETE",
      });
      selectedGrades.forEach((item) => {
        item.grades = item.grades.filter((grade) => grade.id !== gradeItem.id);
        item.average = calculateSubjectAverage(item);
      });
      renderGrades();
      showGradeMessage("Nota borrada.");
    } catch (error) {
      showGradeMessage(error.message);
    } finally {
      isSavingGrade = false;
    }
  }

  async function loadGradesForSelectedStudent() {
    selectedGrades = await requestJson(`/api/students/${selectedStudent.id}/grades`);
    renderGrades();
  }

  async function loadStudents() {
    try {
      students = await requestJson("/api/students");
      renderStudents();
    } catch (error) {
      showMessage(error.message);
    }
  }

  function renderPosts() {
    postList.innerHTML = "";

    if (posts.length === 0) {
      const emptyPost = document.createElement("article");
      emptyPost.className = "empty-item";
      emptyPost.textContent = "Todavia no hay publicaciones.";
      postList.append(emptyPost);
      return;
    }

    posts.forEach((post) => {
      const article = document.createElement("article");
      const author = document.createElement("div");
      const meta = document.createElement("div");
      const avatar = document.createElement("span");
      const authorText = document.createElement("div");
      const authorName = document.createElement("strong");
      const date = document.createElement("small");
      const body = document.createElement("p");
      const images = getFeedImages(post);
      const actions = document.createElement("div");
      const likeButton = document.createElement("button");
      const stats = document.createElement("div");
      const editButton = document.createElement("button");
      const deleteButton = document.createElement("button");
      const comments = document.createElement("div");
      const commentForm = document.createElement("form");
      const commentInput = document.createElement("input");
      const commentButton = document.createElement("button");

      article.className = "post-card";
      author.className = "feed-author";
      avatar.className = "feed-avatar";
      avatar.textContent = "AC";
      authorName.textContent = "Aula comunidad";
      date.textContent = formatDate(post.created_at);
      meta.className = "post-meta";
      meta.textContent = post.updated_at && post.updated_at !== post.created_at ? "Editado" : "Publicado";
      authorText.append(authorName, date, meta);
      author.append(avatar, authorText);
      body.className = "post-body";
      body.textContent = post.content;

      article.append(author);

      if (post.content) {
        article.append(body);
      }

      if (images.length > 0) {
        article.append(renderImageGallery(images, "Imagen de la publicacion"));
      }

      actions.className = "inline-actions";
      likeButton.type = "button";
      likeButton.className = "feed-action-button";
      likeButton.textContent = "Me gusta";
      likeButton.addEventListener("click", () => likePost(post.id));
      editButton.type = "button";
      editButton.textContent = "Editar";
      editButton.addEventListener("click", () => editPost(post));
      deleteButton.type = "button";
      deleteButton.className = "ghost-button";
      deleteButton.textContent = "Borrar";
      deleteButton.addEventListener("click", () => deletePost(post.id));
      actions.append(likeButton, editButton, deleteButton);

      stats.className = "feed-stats";
      stats.textContent = `${post.likes_count || 0} me gusta · ${post.comments.length} comentario(s)`;

      comments.className = "comments";
      post.comments.forEach((comment) => {
        const item = document.createElement("div");
        const commentBody = document.createElement("div");
        const text = document.createElement("span");
        const commentDate = document.createElement("small");
        const commentActions = document.createElement("div");
        const editCommentButton = document.createElement("button");
        const deleteCommentButton = document.createElement("button");

        item.className = "comment-item";
        commentBody.className = "comment-body";
        text.textContent = comment.content;
        commentDate.textContent = formatDate(comment.created_at);
        commentActions.className = "inline-actions";
        editCommentButton.type = "button";
        editCommentButton.textContent = "Editar";
        editCommentButton.addEventListener("click", () => editComment(comment));
        deleteCommentButton.type = "button";
        deleteCommentButton.className = "ghost-button";
        deleteCommentButton.textContent = "Borrar";
        deleteCommentButton.addEventListener("click", () => deleteComment(comment.id));

        commentActions.append(editCommentButton, deleteCommentButton);
        commentBody.append(text, commentDate);
        item.append(commentBody, commentActions);
        comments.append(item);
      });

      commentForm.className = "comment-form";
      commentInput.type = "text";
      commentInput.placeholder = "Escribe un comentario";
      commentButton.type = "submit";
      commentButton.textContent = "Comentar";
      commentForm.addEventListener("submit", (event) => {
        event.preventDefault();
        addComment(post.id, commentInput);
      });
      commentForm.append(commentInput, commentButton);

      article.append(stats, actions, comments, commentForm);
      postList.append(article);
    });
  }

  async function loadPosts() {
    try {
      posts = await requestJson("/api/community/posts");
      renderPosts();
    } catch (error) {
      showCommunityMessage(error.message);
    }
  }

  async function createPost(content) {
    try {
      const imagesData = await filesToImageDataList(postImageInput.files);
      await requestJson("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, imagesData }),
      });
      postInput.value = "";
      postImageInput.value = "";
      postForm.hidden = true;
      showCommunityMessage();
    } catch (error) {
      showCommunityMessage(error.message);
    }
  }

  async function likePost(postId) {
    try {
      await requestJson(`/api/community/posts/${postId}/like`, { method: "POST" });
    } catch (error) {
      showCommunityMessage(error.message);
    }
  }

  async function editPost(post) {
    const content = window.prompt("Editar publicacion", post.content);

    if (content === null) {
      return;
    }

    try {
      await requestJson(`/api/community/posts/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      showCommunityMessage(error.message);
    }
  }

  async function deletePost(postId) {
    try {
      await requestJson(`/api/community/posts/${postId}`, { method: "DELETE" });
    } catch (error) {
      showCommunityMessage(error.message);
    }
  }

  async function addComment(postId, input) {
    try {
      await requestJson(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.value }),
      });
      input.value = "";
    } catch (error) {
      showCommunityMessage(error.message);
    }
  }

  async function editComment(comment) {
    const content = window.prompt("Editar comentario", comment.content);

    if (content === null) {
      return;
    }

    try {
      await requestJson(`/api/community/comments/${comment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      showCommunityMessage(error.message);
    }
  }

  async function deleteComment(commentId) {
    try {
      await requestJson(`/api/community/comments/${commentId}`, { method: "DELETE" });
    } catch (error) {
      showCommunityMessage(error.message);
    }
  }

  function renderPendingTasks() {
    pendingTaskList.innerHTML = "";

    if (pendingTasks.length === 0) {
      const emptyTask = document.createElement("li");
      emptyTask.className = "empty-item";
      emptyTask.textContent = "No hay tareas pendientes.";
      pendingTaskList.append(emptyTask);
      return;
    }

    pendingTasks.forEach((task) => {
      const item = document.createElement("li");
      const author = document.createElement("div");
      const avatar = document.createElement("span");
      const authorText = document.createElement("div");
      const authorName = document.createElement("strong");
      const date = document.createElement("small");
      const checkbox = document.createElement("input");
      const title = document.createElement("span");
      const images = getFeedImages(task);
      const actions = document.createElement("div");
      const likeButton = document.createElement("button");
      const editButton = document.createElement("button");
      const deleteButton = document.createElement("button");
      const stats = document.createElement("div");
      const comments = document.createElement("div");
      const commentForm = document.createElement("form");
      const commentInput = document.createElement("input");
      const commentButton = document.createElement("button");

      item.className = task.done ? "pending-item post-card is-done" : "pending-item post-card";
      author.className = "feed-author";
      avatar.className = "feed-avatar task-avatar";
      avatar.textContent = "TA";
      authorName.textContent = task.done ? "Tarea completada" : "Tarea pendiente";
      date.textContent = formatDate(task.created_at);
      authorText.append(authorName, date);
      author.append(avatar, authorText);
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(task.done);
      checkbox.title = "Marcar tarea";
      checkbox.addEventListener("change", () => togglePendingTask(task, checkbox.checked));
      checkbox.className = "task-check";
      title.className = "post-body task-title";
      title.textContent = task.title;

      item.append(author, checkbox, title);

      if (images.length > 0) {
        item.append(renderImageGallery(images, "Imagen de la tarea"));
      }

      actions.className = "inline-actions";
      likeButton.type = "button";
      likeButton.className = "feed-action-button";
      likeButton.textContent = "Me gusta";
      likeButton.addEventListener("click", () => likePendingTask(task.id));
      editButton.type = "button";
      editButton.textContent = "Editar";
      editButton.addEventListener("click", () => editPendingTask(task));
      deleteButton.type = "button";
      deleteButton.className = "ghost-button";
      deleteButton.textContent = "Borrar";
      deleteButton.addEventListener("click", () => deletePendingTask(task.id));

      actions.append(likeButton, editButton, deleteButton);
      stats.className = "feed-stats";
      stats.textContent = `${task.likes_count || 0} me gusta · ${(task.comments || []).length} comentario(s)`;

      comments.className = "comments";
      (task.comments || []).forEach((comment) => {
        const commentItem = document.createElement("div");
        const commentBody = document.createElement("div");
        const text = document.createElement("span");
        const commentDate = document.createElement("small");
        const commentActions = document.createElement("div");
        const editCommentButton = document.createElement("button");
        const deleteCommentButton = document.createElement("button");

        commentItem.className = "comment-item";
        commentBody.className = "comment-body";
        text.textContent = comment.content;
        commentDate.textContent = formatDate(comment.created_at);
        commentActions.className = "inline-actions";
        editCommentButton.type = "button";
        editCommentButton.textContent = "Editar";
        editCommentButton.addEventListener("click", () => editPendingTaskComment(comment));
        deleteCommentButton.type = "button";
        deleteCommentButton.className = "ghost-button";
        deleteCommentButton.textContent = "Borrar";
        deleteCommentButton.addEventListener("click", () => deletePendingTaskComment(comment.id));

        commentActions.append(editCommentButton, deleteCommentButton);
        commentBody.append(text, commentDate);
        commentItem.append(commentBody, commentActions);
        comments.append(commentItem);
      });

      commentForm.className = "comment-form";
      commentInput.type = "text";
      commentInput.placeholder = "Comenta esta tarea";
      commentButton.type = "submit";
      commentButton.textContent = "Comentar";
      commentForm.addEventListener("submit", (event) => {
        event.preventDefault();
        addPendingTaskComment(task.id, commentInput);
      });
      commentForm.append(commentInput, commentButton);

      item.append(stats, actions, comments, commentForm);
      pendingTaskList.append(item);
    });
  }

  async function loadPendingTasks() {
    try {
      pendingTasks = await requestJson("/api/pending-tasks");
      renderPendingTasks();
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  async function createPendingTask(title) {
    try {
      const imagesData = await filesToImageDataList(pendingTaskImageInput.files);
      await requestJson("/api/pending-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, imagesData }),
      });
      pendingTaskInput.value = "";
      pendingTaskImageInput.value = "";
      pendingTaskForm.hidden = true;
      showPendingTaskMessage();
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  async function likePendingTask(taskId) {
    try {
      await requestJson(`/api/pending-tasks/${taskId}/like`, { method: "POST" });
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  async function editPendingTask(task) {
    const title = window.prompt("Editar tarea", task.title);

    if (title === null) {
      return;
    }

    try {
      await requestJson(`/api/pending-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  async function togglePendingTask(task, done) {
    try {
      await requestJson(`/api/pending-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  async function addPendingTaskComment(taskId, input) {
    try {
      await requestJson(`/api/pending-tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.value }),
      });
      input.value = "";
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  async function editPendingTaskComment(comment) {
    const content = window.prompt("Editar comentario", comment.content);

    if (content === null) {
      return;
    }

    try {
      await requestJson(`/api/pending-task-comments/${comment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  async function deletePendingTaskComment(commentId) {
    try {
      await requestJson(`/api/pending-task-comments/${commentId}`, { method: "DELETE" });
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  async function deletePendingTask(taskId) {
    try {
      await requestJson(`/api/pending-tasks/${taskId}`, { method: "DELETE" });
    } catch (error) {
      showPendingTaskMessage(error.message);
    }
  }

  searchInput.addEventListener("input", renderStudents);
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  newPostButton.addEventListener("click", () => {
    postForm.hidden = !postForm.hidden;
    if (!postForm.hidden) {
      postInput.focus();
    }
  });
  newTaskButton.addEventListener("click", () => {
    pendingTaskForm.hidden = !pendingTaskForm.hidden;
    if (!pendingTaskForm.hidden) {
      pendingTaskInput.focus();
    }
  });
  postForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createPost(postInput.value);
  });
  pendingTaskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createPendingTask(pendingTaskInput.value);
  });
  closeModalButton.addEventListener("click", closeGradeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeGradeModal();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest(
      "button, .student-button, .post-card, .pending-item, .subject-item"
    );

    if (!target) {
      return;
    }

    const ripple = document.createElement("span");
    const rect = target.getBoundingClientRect();

    ripple.className = "click-ripple";
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    target.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeGradeModal();
    }
  });

  if (socket) {
    socket.on("connect", () => {
      connectionStatus.textContent = "En vivo";
      connectionStatus.classList.add("is-online");
    });

    socket.on("disconnect", () => {
      connectionStatus.textContent = "Reconectando";
      connectionStatus.classList.remove("is-online");
    });

    socket.on("students:updated", (updatedStudents) => {
      students = updatedStudents;
      renderStudents();
    });

    socket.on("grades:updated", ({ studentId }) => {
      if (selectedStudent && selectedStudent.id === studentId && !isSavingGrade) {
        loadGradesForSelectedStudent().catch((error) => {
          showGradeMessage(error.message);
        });
      }
    });

    socket.on("community:updated", (updatedPosts) => {
      posts = updatedPosts;
      renderPosts();
    });

    socket.on("pendingTasks:updated", (updatedTasks) => {
      pendingTasks = updatedTasks;
      renderPendingTasks();
    });
  }

  renderStudents();
  loadStudents();
  loadPosts();
  loadPendingTasks();
});
