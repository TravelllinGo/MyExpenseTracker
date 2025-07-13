import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import bodyParser from 'body-parser';
import db from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: 'samiksha_secret_key',
    resave: false,
    saveUninitialized: false,
  })
);
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Middleware to protect routes
function ensureLogin(req, res, next) {
  if (req.session.userId) next();
  else res.redirect('/login');
}

// Home
app.get('/', (req, res) => {
  res.render('home', { user: req.session.user });
});

// Register
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { name, email, password, salary } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  db.run(
    'INSERT INTO users (name, email, password, salary) VALUES (?, ?, ?, ?)',
    [name, email, hashed, salary],
    function (err) {
      if (err) return res.send('Email already exists!');
      req.session.userId = this.lastID;
      req.session.user = { id: this.lastID, name, email, salary };
      res.redirect('/dashboard');
    }
  );
});

// Login
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.send('Invalid email or password!');
    }
    req.session.userId = user.id;
    req.session.user = user;
    res.redirect('/dashboard');
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Dashboard (protected)
app.get('/dashboard', ensureLogin, (req, res) => {
  const userId = req.session.user.id;

  db.all(
    `SELECT amount, category, date FROM expenses WHERE user_id = ?`,
    [userId],
    (err, expenses) => {
      if (err) return res.send('Error loading expenses');

      const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

      const today = new Date();
      const last30 = new Date(today);
      last30.setDate(today.getDate() - 30);
      const prev30 = new Date(today);
      prev30.setDate(today.getDate() - 60);

      const last30Sum = expenses
        .filter((e) => new Date(e.date) > last30)
        .reduce((sum, e) => sum + e.amount, 0);

      const prev30Sum = expenses
        .filter((e) => new Date(e.date) <= last30 && new Date(e.date) > prev30)
        .reduce((sum, e) => sum + e.amount, 0);

      const diff = last30Sum - prev30Sum;
      const trend =
        diff > 0 ? '↑ more spent' : diff < 0 ? '↓ less spent' : 'no change';

      // Prepare chart data
      const categoryTotals = {};
      expenses.forEach((e) => {
        categoryTotals[e.category] =
          (categoryTotals[e.category] || 0) + e.amount;
      });

      const chartData = {
        labels: Object.keys(categoryTotals),
        values: Object.values(categoryTotals),
      };

      res.render('dashboard', {
        user: req.session.user,
        totalSpent,
        last30Sum,
        prev30Sum,
        diff,
        trend,
        chartData, // ✅ This is critical!
      });
    }
  );
});
app.get('/add', ensureLogin, (req, res) => {
  res.render('addExpense');
});
// Handle Add Expense
app.post('/add', ensureLogin, (req, res) => {
  const { title, amount, category, date } = req.body;
  const userId = req.session.userId;

  db.run(
    `INSERT INTO expenses (user_id, title, amount, category, date) VALUES (?, ?, ?, ?, ?)`,
    [userId, title, amount, category, date],
    (err) => {
      if (err) return res.send('Error adding expense');
      res.redirect('/expenses');
    }
  );
});

// View Expenses Page
app.get('/expenses', ensureLogin, (req, res) => {
  const userId = req.session.userId;

  db.all(
    `SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC`,
    [userId],
    (err, expenses) => {
      if (err) return res.send('Error loading expenses');

      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      const salary = req.session.user.salary;
      const percentSpent = ((total / salary) * 100).toFixed(2);

      res.render('expenses', {
        expenses,
        total,
        percentSpent,
      });
    }
  );
});

app.get('/compare', ensureLogin, (req, res) => {
  const userId = req.session.userId;
  const today = dayjs();
  const last30 = today.subtract(30, 'day').format('YYYY-MM-DD');
  const prev30 = today.subtract(60, 'day').format('YYYY-MM-DD');

  db.all(
    `SELECT date, amount FROM expenses WHERE user_id = ? AND date >= ?`,
    [userId, prev30],
    (err, rows) => {
      if (err) return res.send('Error fetching expenses');

      let last30Sum = 0;
      let prev30Sum = 0;

      rows.forEach((row) => {
        const expDate = dayjs(row.date);
        if (expDate.isAfter(last30)) {
          last30Sum += row.amount;
        } else {
          prev30Sum += row.amount;
        }
      });

      const diff = (last30Sum - prev30Sum).toFixed(2);
      const trend =
        diff > 0 ? '↑ More spent' : diff < 0 ? '↓ Less spent' : 'No change';

      res.render('compare', {
        last30Sum,
        prev30Sum,
        diff,
        trend,
      });
    }
  );
});
app.get('/stats', ensureLogin, (req, res) => {
  const userId = req.session.userId;

  db.all(
    `SELECT category, SUM(amount) as total FROM expenses WHERE user_id = ? GROUP BY category`,
    [userId],
    (err, rows) => {
      if (err) return res.send('Error fetching data');

      const categories = rows.map((row) => row.category);
      const totals = rows.map((row) => row.total);

      res.render('stats', { categories, totals });
    }
  );
});
app.get('/edit/:id', ensureLogin, (req, res) => {
  db.get(
    'SELECT * FROM expenses WHERE id = ?',
    [req.params.id],
    (err, expense) => {
      if (err || !expense) return res.send('Expense not found');
      res.render('editExpense', { expense });
    }
  );
});

// Handle Edit Expense
app.post('/edit/:id', ensureLogin, (req, res) => {
  const { title, amount, category, date } = req.body;
  db.run(
    `UPDATE expenses SET title = ?, amount = ?, category = ?, date = ? WHERE id = ?`,
    [title, amount, category, date, req.params.id],
    (err) => {
      if (err) return res.send('Error updating');
      res.redirect('/expenses');
    }
  );
});

// Handle Delete Expense
app.post('/delete/:id', ensureLogin, (req, res) => {
  db.run('DELETE FROM expenses WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.send('Error deleting');
    res.redirect('/expenses');
  });
});
const PORT = 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
