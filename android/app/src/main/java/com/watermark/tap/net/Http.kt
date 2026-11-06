package com.watermark.tap.net

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** A tiny HTTP client: the app makes only a handful of JSON calls, so no extra library is needed. */
class HttpResult(val code: Int, val body: String)

object Http {
    fun get(url: String): HttpResult = call(url, "GET", null)

    fun postJson(url: String, json: String): HttpResult = call(url, "POST", json)

    private fun call(url: String, method: String, json: String?): HttpResult {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 8_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("Accept", "application/json")
            if (json != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return HttpResult(code, body)
        } catch (e: IOException) {
            throw e
        } finally {
            conn.disconnect()
        }
    }

    /** Reads one top-level string field from a flat JSON object. Enough for our F3/F6 responses. */
    fun field(json: String, name: String): String? =
        Regex("\"" + Regex.escape(name) + "\"\\s*:\\s*\"([^\"]*)\"").find(json)?.groupValues?.get(1)
}
