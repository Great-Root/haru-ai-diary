.PHONY: build run dev clean

build:
	go build -o haru-server ./cmd/server/

run: build
	./haru-server

dev:
	go run ./cmd/server/

clean:
	rm -f haru-server
	rm -f haru.db
