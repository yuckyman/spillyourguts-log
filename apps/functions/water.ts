// Serve the water logging page
// This handles GET /water requests

export async function onRequestGet(): Promise<Response> {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log Water</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    h1 {
      color: #333;
      margin-bottom: 30px;
      text-align: center;
      font-size: 2rem;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      color: #555;
      font-weight: 500;
    }

    input[type="number"],
    input[type="text"],
    textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }

    input[type="number"]:focus,
    input[type="text"]:focus,
    textarea:focus {
      outline: none;
      border-color: #667eea;
    }

    textarea {
      resize: vertical;
      font-family: inherit;
    }

    .submit-btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      margin-top: 10px;
    }

    .submit-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }

    .submit-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .message {
      margin-top: 20px;
      padding: 16px;
      border-radius: 8px;
      text-align: center;
      font-weight: 500;
    }

    .message.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }

    .message.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }

    .message.info {
      background: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
    }

    @media (max-width: 600px) {
      .container {
        padding: 24px;
      }
      
      h1 {
        font-size: 1.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Log Water Intake</h1>
    
    <form id="waterForm">
      <div class="form-group">
        <label for="amount">Amount (oz):</label>
        <input type="number" id="amount" name="amount" min="0" max="10000" required>
      </div>
      
      <div class="form-group">
        <label for="source">Source (optional):</label>
        <input type="text" id="source" name="source" placeholder="e.g., bottle, tap">
      </div>
      
      <div class="form-group">
        <label for="note">Note (optional):</label>
        <textarea id="note" name="note" rows="3" placeholder="Any additional notes..."></textarea>
      </div>
      
      <button type="submit" id="submitBtn" class="submit-btn">
        Submit
      </button>
    </form>
    
    <div id="message" class="message" style="display: none;"></div>
  </div>
  
  <script>
    // Read amount from query params
    const urlParams = new URLSearchParams(window.location.search);
    const amountParam = urlParams.get('amount');
    const defaultAmount = amountParam ? parseInt(amountParam, 10) : 64;
    if (!isNaN(defaultAmount) && defaultAmount > 0) {
      document.getElementById('amount').value = defaultAmount;
    }

    const form = document.getElementById('waterForm');
    const submitBtn = document.getElementById('submitBtn');
    const messageDiv = document.getElementById('message');

    function showMessage(text, type = 'info') {
      messageDiv.textContent = text;
      messageDiv.className = \`message \${type}\`;
      messageDiv.style.display = 'block';
      
      // Scroll to message
      messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideMessage() {
      messageDiv.style.display = 'none';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      hideMessage();
      
      const amount = parseInt(document.getElementById('amount').value, 10);
      const source = document.getElementById('source').value.trim() || null;
      const note = document.getElementById('note').value.trim() || null;
      
      if (isNaN(amount) || amount < 0) {
        showMessage('Please enter a valid amount', 'error');
        return;
      }
      
      // Disable submit button
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      
      try {
        const response = await fetch('/api/events/water', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount_oz: amount,
            source: source,
            note: note,
          }),
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to log water');
        }
        
        // Success!
        showMessage(\`✓ Logged \${amount} oz of water!\`, 'success');
        
        // Reset form (but keep amount if it was from query param)
        document.getElementById('source').value = '';
        document.getElementById('note').value = '';
        
        // Optionally reset amount to default if it wasn't from query param
        if (!amountParam) {
          document.getElementById('amount').value = '64';
        }
        
      } catch (error) {
        console.error('Error:', error);
        showMessage(error.message || 'An error occurred. Please try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
    },
  });
}

