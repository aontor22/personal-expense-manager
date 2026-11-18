import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail, validatePassword, isAnonymousUser, registerEmail, signInEmail,
  signInGoogle, requestPasswordReset, updatePassword, finishEmailUpgrade, signOut
} from '../src/expenseflow-auth/auth-operations.mjs';

function mock({ user=null, error=null }={}) {
  const calls=[];
  const auth={
    getUser:async()=>({data:{user},error:null}),
    getSession:async()=>({data:{session:user?{user}:null},error:null}),
    updateUser:async(...args)=>{calls.push(['updateUser',...args]);return{data:{user},error}},
    signUp:async(...args)=>{calls.push(['signUp',...args]);return{data:{session:null},error}},
    signInWithPassword:async(...args)=>{calls.push(['signInWithPassword',...args]);return{data:{user},error}},
    signInWithOAuth:async(...args)=>{calls.push(['signInWithOAuth',...args]);return{data:{url:'https://example.test'},error}},
    linkIdentity:async(...args)=>{calls.push(['linkIdentity',...args]);return{data:{url:'https://example.test'},error}},
    resetPasswordForEmail:async(...args)=>{calls.push(['resetPasswordForEmail',...args]);return{data:{},error}},
    signOut:async()=>{calls.push(['signOut']);return{error}}
  };
  return {supabase:{auth},calls};
}
const redirectTo='https://personal-expense-manager-six.vercel.app/';

test('validate emails and password constraints',()=>{
 assert.equal(validateEmail('example@test.com'),true);
 assert.equal(validateEmail('bad@@example.com'),false);
 assert.equal(validatePassword('too-short'),false);
 assert.equal(validatePassword('CorrectLengthPassword123'),true);
});
test('recognizes guest and permanent accounts',()=>{
 assert.equal(isAnonymousUser({is_anonymous:true}),true);
 assert.equal(isAnonymousUser({is_anonymous:false}),false);
 assert.equal(isAnonymousUser(null),false);
});
test('new user email signup passes redirect',async()=>{
 const {supabase,calls}=mock();
 const r=await registerEmail(supabase,{email:'A@Example.COM',password:'SecurePassword123',redirectTo});
 assert.equal(r.status,'confirmation-sent');
 assert.equal(calls[0][0],'signUp');
 assert.equal(calls[0][1].email,'a@example.com');
 assert.equal(calls[0][1].options.emailRedirectTo,redirectTo);
});
test('anonymous signup links same account instead of creating new one',async()=>{
 const {supabase,calls}=mock({user:{id:'guest-123',is_anonymous:true}});
 const r=await registerEmail(supabase,{email:'first@example.com',password:'SecurePassword123',redirectTo});
 assert.equal(r.status,'upgrade-email-sent');
 assert.deepEqual(calls.map(c=>c[0]),['updateUser']);
 assert.equal(calls[0][1].email,'first@example.com');
});
test('email upgrade password requires verified email',async()=>{
 const {supabase}=mock({user:{id:'guest-123',is_anonymous:true}});
 await assert.rejects(finishEmailUpgrade(supabase,'SecurePassword123'),/Verify your email/);
});
test('email upgrade can set password after verification',async()=>{
 const {supabase,calls}=mock({user:{id:'guest-123',email:'first@example.com'}});
 const r=await finishEmailUpgrade(supabase,'SecurePassword123');
 assert.equal(r.status,'password-updated');
 assert.deepEqual(calls[0],['updateUser',{password:'SecurePassword123'}]);
});
test('email login for signed-out user',async()=>{
 const {supabase,calls}=mock();
 const r=await signInEmail(supabase,{email:'first@example.com',password:'pw'});
 assert.equal(r.status,'signed-in');
 assert.equal(calls[0][0],'signInWithPassword');
});
test('switching from guest without isolation callback is blocked',async()=>{
 const {supabase,calls}=mock({user:{id:'guest',is_anonymous:true}});
 await assert.rejects(signInEmail(supabase,{email:'first@example.com',password:'pw'}),/Account switching is blocked/);
 assert.equal(calls.length,0);
});
test('account switching invokes safety callback before sign in',async()=>{
 const {supabase,calls}=mock({user:{id:'guest',is_anonymous:true}});
 await signInEmail(supabase,{email:'first@example.com',password:'pw',beforeSwitch:async(user)=>{assert.equal(user.id,'guest');calls.push(['safe']);}});
 assert.deepEqual(calls.map(c=>c[0]),['safe','signInWithPassword']);
});
test('google linking preserves current guest session',async()=>{
 const {supabase,calls}=mock({user:{id:'guest',is_anonymous:true}});
 const r=await signInGoogle(supabase,{redirectTo,intent:'link'});
 assert.equal(r.status,'redirecting');
 assert.deepEqual(calls.map(c=>c[0]),['linkIdentity']);
});
test('google sign-in for logged-out user starts oauth',async()=>{
 const {supabase,calls}=mock();
 await signInGoogle(supabase,{redirectTo});
 assert.equal(calls[0][0],'signInWithOAuth');
});
test('google account switching blocked without safety callback',async()=>{
 const {supabase}=mock({user:{id:'guest',is_anonymous:true}});
 await assert.rejects(signInGoogle(supabase,{redirectTo}),/Account switching is blocked/);
});
test('password reset sends generic response',async()=>{
 const {supabase,calls}=mock();
 const result=await requestPasswordReset(supabase,{email:'a@example.com',redirectTo});
 assert.equal(result.status,'reset-sent');
 assert.equal(calls[0][0],'resetPasswordForEmail');
});
test('password update uses Supabase Auth',async()=>{
 const {supabase,calls}=mock();
 await updatePassword(supabase,'SecurePassword123');
 assert.equal(calls[0][0],'updateUser');
});
test('signout protected until safe data-isolation callback provided',async()=>{
 const {supabase,calls}=mock({user:{id:'guest'}});
 await assert.rejects(signOut(supabase,{}),/Sign-out is blocked/);
 await signOut(supabase,{beforeSwitch:async()=>{}});
 assert.deepEqual(calls.map(c=>c[0]),['signOut']);
});
test('server-side auth errors are returned without swallowing',async()=>{
 const {supabase}=mock({error:new Error('Provider is not enabled')});
 await assert.rejects(signInGoogle(supabase,{redirectTo}),/Provider is not enabled/);
});
