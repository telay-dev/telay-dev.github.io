// 本地验收夹具，不是 DSH，不提供模型响应。
package main

import (
 "fmt"
 "net/http"
 "github.com/coder/websocket"
)
func main(){
 http.HandleFunc("/",func(w http.ResponseWriter,r *http.Request){
  if r.URL.Query().Get("token")=="fixture"{http.SetCookie(w,&http.Cookie{Name:"fixture",Value:"ok",Path:"/",HttpOnly:true});http.Redirect(w,r,"/",302);return}
  if _,err:=r.Cookie("fixture");err!=nil{http.Error(w,"unauthorized",401);return}
  if r.URL.Path=="/api/remote.mux"{s,err:=websocket.Accept(w,r,nil);if err!=nil{return};defer s.CloseNow();for{typ,b,err:=s.Read(r.Context());if err!=nil{return};s.Write(r.Context(),typ,b)} }
  if r.URL.Path=="/api/echo"{w.Header().Set("Content-Type","application/json");fmt.Fprint(w,`{"ok":true,"source":"local-fixture"}`);return}
  if r.URL.Path=="/assets/fixture.js"{w.Header().Set("Content-Type","application/javascript");fmt.Fprint(w,`(async()=>{const r=await fetch('/api/echo');window.httpResult=await r.json();document.querySelector('#http').textContent='HTTP 已通过：'+JSON.stringify(window.httpResult);const s=new WebSocket(location.origin.replace('http:','ws:')+'/api/remote.mux');s.onopen=()=>s.send('real-derp-websocket');s.onmessage=e=>{window.wsResult=e.data;document.querySelector('#ws').textContent='WebSocket 已通过：'+e.data;};})()`);return}
  w.Header().Set("Content-Type","text/html;charset=utf-8");fmt.Fprint(w,`<!doctype html><html><head><title>传输验收夹具 · 非 DSH</title></head><body><h1>传输验收夹具（不是 DSH）</h1><p id="http">等待 HTTP</p><p id="ws">等待 WebSocket</p><script src="/assets/fixture.js"></script></body></html>`)
 });fmt.Println("fixture at 127.0.0.1:3099");http.ListenAndServe("127.0.0.1:3099",nil)
}
