// Import necessary modules and libraries
import express, { Request, Response } from 'express';
import moment from 'moment-timezone';
import axios from 'axios';
import { Pool } from 'pg';

// Initialize Express application
const app = express();
const port = 3000;

// Initialize PostgreSQL connection pool
const pool = new Pool({
  user: 'hanifm',
  host: 'localhost',
  database: 'mana',
  password: 'oktober',
  port: 5432,
});

// Middleware to parse JSON requests
app.use(express.json());

// POST endpoint to create a user
app.post('/user', async (req: Request, res: Response) => {
  const { fullName, customMessage, birthday, location, email } = req.body;

  // Validate request payload
  if (!fullName || !customMessage || !birthday || !location || !email) {
    return res.status(400).json({ error: 'Invalid user data' });
  }

  // Save user to the PostgreSQL database
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertUserQuery = 'INSERT INTO users (full_name, custom_message, birthday, location, email) VALUES ($1, $2, $3, $4, $5)';
    await client.query(insertUserQuery, [fullName, customMessage, birthday, location, email]);

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
app.delete('/user', async (req: Request, res: Response) => {
  const { fullName } = req.body;

  // Remove user from the PostgreSQL database
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deleteUserQuery = 'DELETE FROM users WHERE full_name = $1';
    const result = await client.query(deleteUserQuery, [fullName]);

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
app.put('/user', async (req: Request, res: Response) => {
  const { fullName, newBirthday, location, newEmail } = req.body;

  // Validate request payload
  if (!fullName || !newBirthday || !location || !newEmail) {
    return res.status(400).json({ error: 'Invalid user data' });
  }

  // Find the user in the PostgreSQL database
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateUserQuery = 'UPDATE users SET birthday = $1, location = $2, email = $3 WHERE full_name = $4 RETURNING *';
    const result = await client.query(updateUserQuery, [newBirthday, location, newEmail, fullName]);

    await client.query('COMMIT');

    if (result.rowCount === 1) {
      // If the birthday is updated, adjust the scheduled messages
      const originalBirthday = result.rows[0].birthday;
      if (moment(originalBirthday).format('MM-DD') !== moment(newBirthday).format('MM-DD')) {
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

// Schedule the daily task to send birthday messages
const scheduleBirthdayMessages = () => {
  const now = moment();

  // Iterate through users and send birthday messages if it's their birthday
  pool.query('SELECT * FROM users', (error, result) => {
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

// Function to send birthday messages
const sendBirthdayMessage = async (user: any) => {
  try {
    const response = await axios.post('https://email-service.digitalenvision.com.au', {
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


// Schedule the daily task to send birthday messages at 9 am local time
setInterval(() => {
  const now = moment();

  if (now.hour() === 9 && now.minute() === 0) {
    scheduleBirthdayMessages();
  }
}, 60000); // Check every minute

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
