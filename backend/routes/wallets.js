const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// =====================================================
// WALLET ROUTES
// =====================================================

// Lấy số dư ví
router.get('/balance', authenticate, async (req, res) => {
  try {
    // Try to get wallet from database
    const { data: wallet, error } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', req.user.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Wallet doesn't exist yet, return 0
        return res.json({ balance: 0, wallet_exists: false });
      }
      throw error;
    }
    
    res.json({ 
      balance: wallet.balance || 0, 
      wallet_exists: true 
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi lấy số dư ví' });
  }
});

// Nạp tiền (mô phỏng)
router.post('/deposit', authenticate, async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }
    
    // Get or create wallet
    let wallet;
    const { data: existingWallet, error: checkError } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();
    
    if (checkError && checkError.code === 'PGRST116') {
      // Create new wallet
      const { data: newWallet, error: createError } = await supabaseAdmin
        .from('wallets')
        .insert({
          user_id: req.user.id,
          balance: amount
        })
        .select()
        .single();
      
      if (createError) throw createError;
      wallet = newWallet;
    } else if (checkError) {
      throw checkError;
    } else {
      // Update existing wallet
      const newBalance = (existingWallet.balance || 0) + amount;
      const { data: updatedWallet, error: updateError } = await supabaseAdmin
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', req.user.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      wallet = updatedWallet;
    }
    
    // Create transaction record (if table exists)
    try {
      await supabaseAdmin
        .from('transactions')
        .insert({
          wallet_id: wallet.id,
          type: 'deposit',
          amount: amount,
          description: 'Nạp tiền vào ví',
          status: 'completed'
        });
    } catch (txError) {
      console.log('⚠️ Could not create transaction record:', txError.message);
    }
    
    res.json({ 
      message: 'Nạp tiền thành công',
      new_balance: wallet.balance,
      transaction_id: wallet.id
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi nạp tiền' });
  }
});

// Yêu cầu rút tiền
router.post('/withdraw', authenticate, async (req, res) => {
  try {
    const { amount, bank_name, account_number, account_holder } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }
    
    if (!bank_name || !account_number || !account_holder) {
      return res.status(400).json({ error: 'Thiếu thông tin ngân hàng' });
    }
    
    // Get wallet
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();
    
    if (walletError) {
      if (walletError.code === 'PGRST116') {
        return res.status(400).json({ error: 'Không tìm thấy ví' });
      }
      throw walletError;
    }
    
    // Check balance
    if (wallet.balance < amount) {
      return res.status(400).json({ error: 'Số dư không đủ' });
    }
    
    // Update wallet balance
    const newBalance = wallet.balance - amount;
    const { error: updateError } = await supabaseAdmin
      .from('wallets')
      .update({ balance: newBalance })
      .eq('user_id', req.user.id);
    
    if (updateError) throw updateError;
    
    // Create transaction record (if table exists)
    try {
      await supabaseAdmin
        .from('transactions')
        .insert({
          wallet_id: wallet.id,
          type: 'withdraw',
          amount: amount,
          description: `Rút tiền về ${bank_name} - ${account_number}`,
          status: 'completed'
        });
    } catch (txError) {
      console.log('⚠️ Could not create transaction record:', txError.message);
    }
    
    res.json({ 
      message: 'Yêu cầu rút tiền đã được gửi',
      new_balance: newBalance,
      withdraw_amount: amount,
      bank_details: { bank_name, account_number, account_holder }
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi rút tiền' });
  }
});

// Lịch sử giao dịch
router.get('/transactions', authenticate, async (req, res) => {
  try {
    // Try to get wallet first
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('id')
      .eq('user_id', req.user.id)
      .single();
    
    if (walletError) {
      if (walletError.code === 'PGRST116') {
        // No wallet yet, return empty array
        return res.json([]);
      }
      throw walletError;
    }
    
    // Get transactions
    const { data: transactions, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (txError) {
      if (txError.code === '42P01') {
        // transactions table doesn't exist yet
        return res.json([]);
      }
      throw txError;
    }
    
    res.json(transactions || []);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi lấy lịch sử giao dịch' });
  }
});

// Tạo ví nếu chưa có (helper endpoint)
router.post('/setup', authenticate, async (req, res) => {
  try {
    const { data: existingWallet, error: checkError } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id)
      .single();
    
    if (checkError && checkError.code === 'PGRST116') {
      // Create new wallet
      const { data: newWallet, error: createError } = await supabaseAdmin
        .from('wallets')
        .insert({
          user_id: req.user.id,
          balance: 0
        })
        .select()
        .single();
      
      if (createError) throw createError;
      
      res.json({ 
        message: 'Đã tạo ví mới',
        wallet: newWallet 
      });
    } else if (checkError) {
      throw checkError;
    } else {
      res.json({ 
        message: 'Ví đã tồn tại',
        wallet: existingWallet 
      });
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi thiết lập ví' });
  }
});

module.exports = router;