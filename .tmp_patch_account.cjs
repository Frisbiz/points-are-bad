const fs=require('fs');
let p=fs.readFileSync('src/App.jsx','utf8');
const oldPw=`const changePassword = async () => {
    if (!pwCurrent||!pwNew||!pwConfirm){setPwError("Fill in all fields.");return;}
    if (pwNew.trim().length<6){setPwError("Password must be at least 6 characters.");return;}
    if (pwNew!==pwConfirm){setPwError("New passwords do not match.");return;}
    setPwLoading(true);setPwError("");
    const fresh = await sget(\`user:\${user.username}\`);
    if (!fresh||fresh.password!==pwCurrent){setPwError("Current password is incorrect.");setPwLoading(false);return;}
    await sset(\`user:\${user.username}\`,{...fresh,password:pwNew});
    setPwSuccess(true);setPwLoading(false);
    setTimeout(()=>{setAccountOpen(false);setPwCurrent("");setPwNew("");setPwConfirm("");setPwSuccess(false);},2000);
  };`;
const newPw=`const changePassword = async () => {
    if (!pwCurrent||!pwNew||!pwConfirm){setPwError("Fill in all fields.");return;}
    if (pwNew.trim().length<6){setPwError("Password must be at least 6 characters.");return;}
    if (pwNew!==pwConfirm){setPwError("New passwords do not match.");return;}
    setPwLoading(true);setPwError("");
    const res = await fetch('/api/account-change-password', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew })
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok){setPwError(data.error||"Failed to change password.");setPwLoading(false);return;}
    setPwSuccess(true);setPwLoading(false);
    setTimeout(()=>{setAccountOpen(false);setPwCurrent("");setPwNew("");setPwConfirm("");setPwSuccess(false);},2000);
  };`;
p=p.split(oldPw).join(newPw);
const oldEmail=`const saveEmail = async () => {
    const normEmail = emailInput.trim().toLowerCase();
    setEmailError("");
    if (!normEmail || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    // No-op: same as current email
    if (user.email && normEmail === user.email.toLowerCase()) {
      setEmailChanging(false);
      setEmailInput("");
      return;
    }
    setEmailLoading(true);
    try {
      const existing = await sget(\`useremail:\${normEmail}\`);
      if (existing && existing.username !== user.username) {
        setEmailError("Email already in use.");
        return;
      }
      // Write sequentially
      await sset(\`useremail:\${normEmail}\`, { username: user.username });
      if (user.email) {
        const delOk = await sdel(\`useremail:\${user.email}\`);
        if (!delOk) {
          // sdel failed after sset succeeded -- unrecoverable partial write
          setEmailError("Something went wrong. Please contact support.");
          return;
        }
      }
      const patchOk = await spatch(\`user:\${user.username}\`, "email", normEmail);
      if (!patchOk) {
        setEmailError("Something went wrong. Please contact support.");
        return;
      }
      onUpdateUser({ ...user, email: normEmail });
      setEmailSuccess(true);
      setTimeout(() => {
        setEmailSuccess(false);
        setEmailChanging(false);
        setEmailInput("");
      }, 1500);
    } finally {
      setEmailLoading(false);
    }
  };`;
const newEmail=`const saveEmail = async () => {
    const normEmail = emailInput.trim().toLowerCase();
    setEmailError("");
    if (!normEmail || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (user.email && normEmail === user.email.toLowerCase()) {
      setEmailChanging(false);
      setEmailInput("");
      return;
    }
    setEmailLoading(true);
    try {
      const res = await fetch('/api/account-change-email', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ email: normEmail })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) {
        setEmailError(data.error || "Something went wrong. Please contact support.");
        return;
      }
      onUpdateUser({ ...user, email: data.email || normEmail });
      setEmailSuccess(true);
      setTimeout(() => {
        setEmailSuccess(false);
        setEmailChanging(false);
        setEmailInput("");
      }, 1500);
    } finally {
      setEmailLoading(false);
    }
  };`;
p=p.split(oldEmail).join(newEmail);
fs.writeFileSync('src/App.jsx',p);
