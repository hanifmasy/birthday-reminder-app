const express = require('express');
const moment = require('moment-timezone');
const axios = require('axios');
const { Pool } = require('pg');

const app = express();
const port = 3000;

const pool = new Pool({
  user: 'hanifm',
  host: 'localhost',
  database: 'mana',
  password: 'oktober',
  port: 5432,
});

app.use(express.json());

// POST endpoint to create a user
app.post('/user',  async (req, res) => {
  const { full_name, custom_message, birthday, location, email } = req.body;

  if (!full_name || !birthday || !location || !email) {
    return res.status(400).json({ error: 'Invalid user data' });
  }

  const client =  await pool.connect();

  try {
     client.query('BEGIN');

    const insertUserQuery = 'INSERT INTO surya.users (full_name, custom_message, birthday, location, email) VALUES ($1, $2, $3, $4, $5)';
    await client.query(insertUserQuery, [full_name, custom_message, birthday, location, email]);

    await client.query('COMMIT');

    return res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// DELETE endpoint to delete a user
app.delete('/user', async (req, res) => {
  const { full_name } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const deleteUserQuery = 'DELETE FROM surya.users WHERE full_name = $1';
    const result = await client.query(deleteUserQuery, [full_name]);

    await client.query('COMMIT');

    if (result.rowCount === 1) {
      return res.json({ message: 'User deleted successfully' });
    } else {
      return res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PUT endpoint to edit user details
app.put('/user', async (req, res) => {
  const { full_name, new_birthday, location, new_email } = req.body;

  if (!full_name || !new_birthday || !location || !new_email) {
    return res.status(400).json({ error: 'Invalid user data' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updateUserQuery = 'UPDATE surya.users SET birthday = $1, location = $2, email = $3 WHERE full_name = $4 RETURNING *';
    const result = await client.query(updateUserQuery, [new_birthday, location, new_email, full_name]);

    await client.query('COMMIT');

    if (result.rowCount === 1) {
      const originalBirthday = result.rows[0].birthday;
      if (moment(originalBirthday).format('MM-DD') !== moment(new_birthday).format('MM-DD')) {
        sendBirthdayMessage(result.rows[0]);
      }

      return res.json({ message: 'User details updated successfully' });
    } else {
      return res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating user details:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Schedule the daily task to send birthday messages at 9 am local time
setInterval(() => {
  const now = moment();

  if (now.hour() === 9 && now.minute() === 0) {
    scheduleBirthdayMessages();
  }
}, 60000); // Check every minute

const scheduleBirthdayMessages = () => {
  const now = moment();

  pool.query('SELECT * FROM surya.users', (error, result) => {
    if (error) {
      console.error('Error querying users:', error);
      return;
    }

    const users = result.rows;
    users.forEach((user) => {
      const userBirthday = moment(user.birthday);

      if (now.isSame(userBirthday, 'day')) {
        sendBirthdayMessage(user);
      }
    });
  });
};

const sendBirthdayMessage = async (user) => {
  try {
    const response = await axios.post('https://email-service.digitalenvision.com.au/send-email', {
      email: `${user.full_name}`,
      message: `Hey, ${user.full_name}, ${user.custom_message || 'Happy birthday'}`,
    });

    if (response.status === 200) {
      const sentTime = moment().format('YYYY-MM-DD HH:mm:ss');

      console.log('Email sent successfully.');
      console.log('Response Content Type:', response.headers['content-type']);
      console.log('Response Body:', JSON.stringify({ status: 'sent', sentTime }));

      // Handle any additional logic for successful message delivery
    } else if (response.status === 400) {
      console.error('Invalid input');
      // Handle errors or timeouts
    } else if (response.status === 500) {
      const isServerError = Math.random() < 0.1;

      if (isServerError) {
        console.error('Server error. 10% of the time this status will be returned.');
      } else {
        console.log('Email sent successfully.');
        // Handle any additional logic for successful message delivery
      }
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.error('Request timed out. 10% of the time the server will hang.');
    } else {
      console.error(`Error sending birthday message to ${user.full_name} (${user.email}):`, error.message);
      // Handle network errors or other exceptions
    }
  }
};

app.get('/', (req, res) => {
  res.send('Birthday Remider App Running!');
});

app.listen(port, () => {
  console.log(`Server Running on ${port}`);
});
