// Read amount from query params
const urlParams = new URLSearchParams(window.location.search);
const amountParam = urlParams.get('amount');
if (amountParam) {
  const amount = parseInt(amountParam, 10);
  if (!isNaN(amount) && amount > 0) {
    document.getElementById('amount').value = amount;
  }
}

const form = document.getElementById('waterForm');
const submitBtn = document.getElementById('submitBtn');
const messageDiv = document.getElementById('message');

function showMessage(text, type = 'info') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
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
    showMessage(`✓ Logged ${amount} oz of water!`, 'success');
    
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

