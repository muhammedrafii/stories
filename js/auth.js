async function handleSignUp() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const username = document.getElementById('regUsername').value.trim().replace('@', '').toLowerCase();

    if(!email || !password || !username) return alert("Fill in all boxes.");
    
    // 1. Sign up the user inside Supabase Auth
    const { data, error } = await dbClient.auth.signUp({ email, password });
    if (error) return alert(error.message);

    // 2. Safely grab the user ID whether they are instantly logged in or pending confirmation
    const targetUser = data.user;
    
    if (targetUser) {
        // 3. Insert the profile row explicitly into the database
        const { error: profileError } = await dbClient.from('profiles').insert([
            { id: targetUser.id, username: username }
        ]);
        
        if (profileError) {
            console.error("Profile insertion error details:", profileError);
            return alert(`Database Error: ${profileError.message}`);
        }
        
        alert("Registration successful! You can now log in.");
        showAuthScreen('login');
    } else {
        alert("Sign up initiated, please check your email for confirmation!");
    }
}